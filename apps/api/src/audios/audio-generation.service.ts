import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotImplementedException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  splitTextIntoChunks,
  type AudioCostEstimate,
  type AudioGenerationRequest,
  type AudioGenerationStatus,
  type AudioSummary,
  type AudioVoicesResponse,
  type TtsProvider,
} from '@rrn/shared';
import { BudgetExceededError, BudgetService } from '../budget/budget.service';
import { JobRunner, PermanentJobError, type JobContext } from '../jobs/job-runner';
import { JobsService } from '../jobs/jobs.service';
import { OwnerContext } from '../auth/owner-context';
import { ScriptsService } from '../scripts/scripts.service';
import { ObjectStorage } from '../storage/object-storage';
import { extForMime } from './audio-format';
import { AudiosRepository } from './audios.repository';
import { AudiosService } from './audios.service';
import { joinWavs } from './wav';

/** Token do provedor TTS. Nenhum provedor está registrado nesta versão (valor null). */
export const TTS_PROVIDER = Symbol('TTS_PROVIDER');

export const AUDIO_JOB = 'audio.generate';

export const TTS_NOT_CONFIGURED_MESSAGE =
  'A narração automática não está configurada: nenhum provedor TTS foi conectado. Você já pode importar áudios gerados fora da plataforma.';

export const TTS_REQUIREMENTS: readonly string[] = [
  'Documentação oficial da API do Talkify Labs (autenticação, endpoints, vozes, formatos de áudio e limite de caracteres por requisição), ou a escolha de outro serviço de narração.',
  'Um adaptador que implemente a interface TtsProvider (packages/shared/src/providers.ts) e seja registrado no token TTS_PROVIDER (apps/api/src/audios/audios.module.ts).',
  'A chave de API do serviço guardada apenas no servidor, em variável de ambiente (nunca no navegador).',
  'Um orçamento mensal definido por você em Configurações e a confirmação do custo estimado a cada narração.',
];

@Injectable()
export class AudioGenerationService implements OnApplicationBootstrap {
  private readonly log = new Logger(AudioGenerationService.name);

  constructor(
    @Inject(TTS_PROVIDER) private readonly tts: TtsProvider | null,
    private readonly repo: AudiosRepository,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    private readonly scripts: ScriptsService,
    private readonly audios: AudiosService,
    private readonly jobs: JobsService,
    private readonly runner: JobRunner,
    private readonly budget: BudgetService,
    private readonly owner: OwnerContext,
  ) {
    this.runner.register(AUDIO_JOB, (ctx) => this.handle(ctx));
  }

  /** Trabalho "processando" sem nenhum job ativo foi perdido: vira erro (nunca fica preso para sempre). */
  async onApplicationBootstrap() {
    try {
      const n = await this.repo.failOrphaned('Processamento perdido. Use "Tentar novamente" para continuar de onde parou.');
      if (n > 0) this.log.warn(`${n} áudio(s) em processamento sem job ativo foram marcados como erro.`);
    } catch (err) {
      this.log.error(`Reconciliação de áudios falhou: ${(err as Error).message}`);
    }
  }

  status(): AudioGenerationStatus {
    if (!this.tts) return { available: false, provider: null, reason: TTS_NOT_CONFIGURED_MESSAGE, requirements: [...TTS_REQUIREMENTS] };
    return {
      available: true,
      provider: { id: this.tts.id, name: this.tts.name, maxCharsPerRequest: this.tts.maxCharsPerRequest },
      reason: null,
      requirements: [],
    };
  }

  async voices(language?: string): Promise<AudioVoicesResponse> {
    if (!this.tts) return { available: false, voices: [], reason: TTS_NOT_CONFIGURED_MESSAGE };
    return { available: true, voices: await this.tts.listVoices(language), reason: null };
  }

  /** Estimativa de custo para o usuário confirmar antes de gerar. Sem provedor: 501. */
  async estimate(scriptId: string, voiceId: string): Promise<AudioCostEstimate> {
    const tts = this.requireProvider();
    const script = await this.getScript(scriptId);
    const chunks = splitTextIntoChunks(script.content, tts.maxCharsPerRequest);
    return this.estimateChunks(tts, chunks, voiceId, script.language);
  }

  /** Cria a narração e a enfileira. Sem provedor: 501, nada é criado nem simulado. */
  async start(req: AudioGenerationRequest): Promise<AudioSummary> {
    const tts = this.requireProvider();
    const script = await this.getScript(req.scriptId);
    const chunks = splitTextIntoChunks(script.content, tts.maxCharsPerRequest);
    if (chunks.length === 0) {
      throw new BadRequestException({ message: 'Dados inválidos', issues: [{ path: 'scriptId', message: 'O roteiro não tem conteúdo para narrar' }] });
    }
    const voice = (await tts.listVoices(script.language)).find((v) => v.id === req.voiceId);
    if (!voice) throw new BadRequestException({ message: 'Dados inválidos', issues: [{ path: 'voiceId', message: 'Voz indisponível para o idioma do roteiro' }] });

    const est = this.estimateChunks(tts, chunks, voice.id, script.language);
    if (req.approvedMaxCostUsd + 1e-9 < est.estimateUsd) {
      throw new ConflictException({
        message: `Confirme o custo: a estimativa é US$ ${est.estimateUsd.toFixed(2)} e você autorizou até US$ ${req.approvedMaxCostUsd.toFixed(2)}.`,
        code: 'COST_CONFIRMATION_REQUIRED',
        estimateUsd: est.estimateUsd,
      });
    }
    await this.budget.assertCanSpend(est.estimateUsd);

    const rec = await this.repo.create(this.owner.current(), {
      channelId: script.channelId,
      scriptId: script.id,
      title: req.title ?? `${script.title} (narração)`,
      language: script.language,
      status: 'processing',
      source: 'provider',
      providerId: tts.id,
      voiceId: voice.id,
      voiceName: voice.name,
      settings: { speed: req.settings.speed, approvedMaxCostUsd: req.approvedMaxCostUsd },
      partsTotal: chunks.length,
    });
    await this.repo.insertParts(rec.id, chunks);
    await this.jobs.enqueue({ type: AUDIO_JOB, payload: { audioId: rec.id }, dedupeKey: `audio:${rec.id}` });
    return this.audios.get(rec.id);
  }

  /** Retoma um áudio com erro a partir da primeira parte que não foi concluída. */
  async retry(id: string, approvedMaxCostUsd?: number): Promise<AudioSummary> {
    const tts = this.requireProvider();
    const rec = await this.audios.record(id);
    if (rec.source !== 'provider') throw new ConflictException('Só narrações geradas por provedor podem ser reprocessadas.');
    if (rec.status !== 'error') throw new ConflictException('Só áudios com erro podem ser reprocessados.');
    if (rec.providerId !== tts.id) throw new ConflictException('Este áudio foi gerado por outro provedor e não pode ser retomado.');
    const remaining = await this.remainingEstimate(tts, id, rec.voiceId ?? '', rec.language);
    const approved = approvedMaxCostUsd ?? Number(rec.settings.approvedMaxCostUsd ?? 0);
    if (approved + 1e-9 < remaining) {
      throw new ConflictException({
        message: `Confirme o custo: faltam partes estimadas em US$ ${remaining.toFixed(2)} e você autorizou até US$ ${approved.toFixed(2)}.`,
        code: 'COST_CONFIRMATION_REQUIRED',
        estimateUsd: remaining,
      });
    }
    await this.budget.assertCanSpend(remaining);
    await this.repo.update(this.owner.current(), id, { status: 'processing', errorMessage: null });
    await this.jobs.enqueue({ type: AUDIO_JOB, payload: { audioId: id }, dedupeKey: `audio:${id}` });
    return this.audios.get(id);
  }

  private requireProvider(): TtsProvider {
    if (!this.tts) {
      throw new NotImplementedException({
        message: TTS_NOT_CONFIGURED_MESSAGE,
        code: 'TTS_NOT_CONFIGURED',
        requirements: [...TTS_REQUIREMENTS],
      });
    }
    return this.tts;
  }

  private estimateChunks(tts: TtsProvider, chunks: string[], voiceId: string, language: string): AudioCostEstimate {
    const estimateUsd = chunks.reduce((sum, text) => sum + tts.estimateCostUsd({ text, voiceId, language }), 0);
    return { estimateUsd, parts: chunks.length, characters: chunks.reduce((n, c) => n + c.length, 0) };
  }

  private async remainingEstimate(tts: TtsProvider, audioId: string, voiceId: string, language: string) {
    const pending = (await this.repo.listParts(audioId)).filter((p) => !p.fileKey);
    return pending.reduce((sum, p) => sum + tts.estimateCostUsd({ text: p.text, voiceId, language }), 0);
  }

  private async getScript(scriptId: string) {
    try {
      return await this.scripts.get(scriptId);
    } catch {
      throw new BadRequestException({ message: 'Dados inválidos', issues: [{ path: 'scriptId', message: 'Roteiro não encontrado' }] });
    }
  }

  // ---- worker ----

  /**
   * Handler do job `audio.generate`. Uma parte por vez; cada parte concluída é persistida, então
   * qualquer falha (ou queda do worker) retoma da parte pendente. Erros transitórios são repetidos
   * pela fila; erros permanentes ou a última tentativa marcam o áudio como "Erro".
   */
  private async handle(ctx: JobContext) {
    const { audioId } = ctx.job.payload as { audioId: string };
    try {
      await this.process(audioId, ctx);
    } catch (err) {
      const permanent = err instanceof PermanentJobError || err instanceof BudgetExceededError;
      const last = ctx.attempt >= ctx.maxAttempts;
      if (permanent || last) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error(`Falha ao gerar o áudio ${audioId}: ${message}`);
        await this.repo.update(this.owner.current(), audioId, { status: 'error', errorMessage: message.slice(0, 500) });
        return { failed: true }; // o áudio registra o erro; o job termina sem repetir
      }
      throw err; // a fila tenta de novo com espera crescente
    }
  }

  private async process(audioId: string, ctx: JobContext) {
    const tts = this.requireProvider();
    const rec = await this.audios.record(audioId);
    const speed = typeof rec.settings.speed === 'number' ? rec.settings.speed : undefined;
    const approvedMax = Number(rec.settings.approvedMaxCostUsd ?? 0);
    const parts = await this.repo.listParts(audioId);

    let done = parts.filter((p) => p.fileKey).length;
    for (const part of parts) {
      if (part.fileKey) continue;
      if (await ctx.isCanceled()) throw new PermanentJobError('Cancelado pelo usuário');

      const voiceId = rec.voiceId ?? '';
      const estimate = tts.estimateCostUsd({ text: part.text, voiceId, language: rec.language });
      const spentOnThis = Number(rec.settings.spentUsd ?? 0);
      if (spentOnThis + estimate > approvedMax + 1e-9) throw new PermanentJobError('O custo autorizado para esta narração foi atingido. Aumente o valor e tente novamente.');
      await this.budget.assertCanSpend(estimate);

      const out = await tts.synthesize({ text: part.text, voiceId, language: rec.language, speed });
      const cost = out.costUsd ?? estimate;
      await this.budget.record({ providerKind: 'tts', providerId: tts.id, description: `Narração "${rec.title}" (parte ${part.idx + 1}/${parts.length})`, amountUsd: cost, jobId: ctx.job.id });
      rec.settings.spentUsd = spentOnThis + cost;

      const ext = extForMime(out.mimeType);
      if (!ext) throw new PermanentJobError(`Formato de áudio retornado pelo provedor não suportado: ${out.mimeType}`);
      const key = `audio/${rec.ownerId}/${audioId}/part-${part.idx}.${ext}`;
      await this.storage.put(key, out.data, out.mimeType);
      await this.repo.updatePart(audioId, part.idx, { fileKey: key, mimeType: out.mimeType, durationMs: out.durationMs ?? null });
      done++;
      await this.repo.update(this.owner.current(), audioId, { partsDone: done });
      await ctx.setProgress(done / parts.length);
    }
    await this.finalize(audioId, rec.ownerId);
  }

  private async finalize(audioId: string, ownerId: string) {
    const parts = await this.repo.listParts(audioId);
    if (parts.length === 1) {
      const p = parts[0];
      const head = await this.storage.head(p.fileKey!);
      await this.repo.update(ownerId, audioId, {
        status: 'completed', fileKey: p.fileKey, mimeType: p.mimeType, sizeBytes: head?.size ?? null, durationMs: p.durationMs, errorMessage: null,
      });
      return;
    }
    // Várias partes: só é possível juntar WAV sem ferramentas externas. Outros formatos dependem do FFmpeg (Fase 7).
    if (!parts.every((p) => extForMime(p.mimeType ?? '') === 'wav')) {
      throw new PermanentJobError('Juntar partes neste formato de áudio requer o FFmpeg (Fase 7). As partes foram salvas e não foram perdidas.');
    }
    const joined = joinWavs(await Promise.all(parts.map((p) => this.storage.read(p.fileKey!))));
    const key = `audio/${ownerId}/${audioId}.wav`;
    await this.storage.put(key, joined.buffer, 'audio/wav');
    await this.repo.update(ownerId, audioId, {
      status: 'completed', fileKey: key, mimeType: 'audio/wav', sizeBytes: joined.buffer.length,
      durationMs: joined.durationMs, errorMessage: null, partsDone: parts.length,
    });
    await this.storage.deletePrefix(`audio/${ownerId}/${audioId}/`); // partes não são mais necessárias
  }
}
