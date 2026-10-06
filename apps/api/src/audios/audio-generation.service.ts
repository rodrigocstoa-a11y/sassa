import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotImplementedException,
  OnModuleInit,
} from '@nestjs/common';
import {
  splitTextIntoChunks,
  type AudioGenerationRequest,
  type AudioGenerationStatus,
  type AudioSummary,
  type AudioVoicesResponse,
  type TtsProvider,
} from '@rrn/shared';
import { LOCAL_OWNER } from '../channels/channels.service';
import { ScriptsService } from '../scripts/scripts.service';
import { extForMime } from './audio-format';
import { AudioStorage } from './audio-storage';
import { AudiosRepository } from './audios.repository';
import { AudiosService } from './audios.service';
import { joinWavs, parseWav } from './wav';

/** Token do provedor TTS. Nenhum provedor está registrado nesta versão (valor null). */
export const TTS_PROVIDER = Symbol('TTS_PROVIDER');

export const TTS_NOT_CONFIGURED_MESSAGE =
  'A narração automática não está configurada: nenhum provedor TTS foi conectado. Você já pode importar áudios gerados fora da plataforma.';

export const TTS_REQUIREMENTS: readonly string[] = [
  'Documentação oficial da API do Talkify Labs (autenticação, endpoints, vozes, formatos de áudio e limite de caracteres por requisição), ou a escolha de outro serviço de narração.',
  'Um adaptador que implemente a interface TtsProvider (packages/shared/src/providers.ts) e seja registrado no token TTS_PROVIDER (apps/api/src/audios/audios.module.ts).',
  'A chave de API do serviço guardada apenas no servidor, em variável de ambiente (nunca no navegador).',
  'Sua aprovação de custos: nenhum serviço pago é contratado ou chamado sem autorização.',
];

@Injectable()
export class AudioGenerationService implements OnModuleInit {
  private readonly log = new Logger(AudioGenerationService.name);
  private readonly running = new Set<string>();

  constructor(
    @Inject(TTS_PROVIDER) private readonly tts: TtsProvider | null,
    private readonly repo: AudiosRepository,
    private readonly storage: AudioStorage,
    private readonly scripts: ScriptsService,
    private readonly audios: AudiosService,
  ) {}

  /** Nada fica "processando" depois de um reinício: o trabalho em memória foi perdido. */
  onModuleInit() {
    const n = this.repo.failInterrupted('Processamento interrompido (o servidor foi reiniciado). Use "Tentar novamente" para continuar.');
    if (n > 0) this.log.warn(`${n} áudio(s) em processamento foram marcados como erro após o reinício.`);
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

  /** Cria a narração e processa em segundo plano. Sem provedor: 501, nada é criado nem simulado. */
  async start(req: AudioGenerationRequest): Promise<AudioSummary> {
    const tts = this.requireProvider();
    let script;
    try {
      script = this.scripts.get(req.scriptId);
    } catch {
      throw new BadRequestException({ message: 'Dados inválidos', issues: [{ path: 'scriptId', message: 'Roteiro não encontrado' }] });
    }
    const chunks = splitTextIntoChunks(script.content, tts.maxCharsPerRequest);
    if (chunks.length === 0) {
      throw new BadRequestException({ message: 'Dados inválidos', issues: [{ path: 'scriptId', message: 'O roteiro não tem conteúdo para narrar' }] });
    }
    const voices = await tts.listVoices(script.language);
    const voice = voices.find((v) => v.id === req.voiceId);
    if (!voice) throw new BadRequestException({ message: 'Dados inválidos', issues: [{ path: 'voiceId', message: 'Voz indisponível para o idioma do roteiro' }] });

    const rec = this.repo.create(LOCAL_OWNER, {
      channelId: script.channelId,
      scriptId: script.id,
      title: req.title ?? `${script.title} (narração)`,
      language: script.language,
      status: 'processing',
      source: 'provider',
      providerId: tts.id,
      voiceId: voice.id,
      voiceName: voice.name,
      settings: { speed: req.settings.speed },
      partsTotal: chunks.length,
    });
    this.repo.insertParts(rec.id, chunks);
    void this.run(rec.id);
    return this.audios.get(rec.id);
  }

  /** Retoma um áudio com erro a partir da primeira parte que não foi concluída. */
  retry(id: string): AudioSummary {
    const tts = this.requireProvider();
    const rec = this.audios.record(id);
    if (rec.source !== 'provider') throw new ConflictException('Só narrações geradas por provedor podem ser reprocessadas.');
    if (rec.status !== 'error') throw new ConflictException('Só áudios com erro podem ser reprocessados.');
    if (rec.providerId !== tts.id) throw new ConflictException('Este áudio foi gerado por outro provedor e não pode ser retomado.');
    this.repo.update(LOCAL_OWNER, id, { status: 'processing', errorMessage: null });
    void this.run(id);
    return this.audios.get(id);
  }

  private requireProvider(): TtsProvider {
    if (!this.tts) {
      throw new NotImplementedException({ message: TTS_NOT_CONFIGURED_MESSAGE, code: 'TTS_NOT_CONFIGURED', requirements: [...TTS_REQUIREMENTS] });
    }
    return this.tts;
  }

  /** Processamento assíncrono, uma parte por vez. Cada parte concluída é persistida, então falhas retomam dali. */
  private async run(id: string): Promise<void> {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      const tts = this.requireProvider();
      const rec = this.audios.record(id);
      const speed = typeof rec.settings.speed === 'number' ? rec.settings.speed : undefined;
      const parts = this.repo.listParts(id);

      for (const part of parts) {
        if (part.fileKey) continue;
        const out = await tts.synthesize({ text: part.text, voiceId: rec.voiceId ?? '', language: rec.language, speed });
        const ext = extForMime(out.mimeType);
        if (!ext) throw new Error(`Formato de áudio retornado pelo provedor não suportado: ${out.mimeType}`);
        const key = `audio/${LOCAL_OWNER}/${id}/part-${part.idx}.${ext}`;
        await this.storage.put(key, out.data);
        this.repo.updatePart(id, part.idx, { fileKey: key, mimeType: out.mimeType, durationMs: out.durationMs ?? null });
        const done = this.repo.listParts(id).filter((p) => p.fileKey).length;
        this.repo.update(LOCAL_OWNER, id, { partsDone: done });
      }

      await this.finalize(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`Falha ao gerar o áudio ${id}: ${message}`);
      this.repo.update(LOCAL_OWNER, id, { status: 'error', errorMessage: message.slice(0, 500) });
    } finally {
      this.running.delete(id);
    }
  }

  private async finalize(id: string) {
    const parts = this.repo.listParts(id);
    if (parts.length === 1) {
      const p = parts[0];
      this.repo.update(LOCAL_OWNER, id, {
        status: 'completed', fileKey: p.fileKey, mimeType: p.mimeType,
        sizeBytes: await this.storage.size(p.fileKey!), durationMs: p.durationMs, errorMessage: null,
      });
      return;
    }
    // Várias partes: só é possível juntar WAV sem ferramentas externas. Outros formatos dependem do FFmpeg (Fase 7).
    if (!parts.every((p) => extForMime(p.mimeType ?? '') === 'wav')) {
      throw new Error('Juntar partes neste formato de áudio requer o FFmpeg (Fase 7). As partes foram salvas e não foram perdidas.');
    }
    const joined = joinWavs(await Promise.all(parts.map((p) => this.storage.read(p.fileKey!))));
    const key = `audio/${LOCAL_OWNER}/${id}.wav`;
    await this.storage.put(key, joined.buffer);
    parseWav(joined.buffer); // sanidade do resultado
    this.repo.update(LOCAL_OWNER, id, {
      status: 'completed', fileKey: key, mimeType: 'audio/wav', sizeBytes: joined.buffer.length,
      durationMs: joined.durationMs, errorMessage: null, partsDone: parts.length,
    });
    await this.storage.delete(`audio/${LOCAL_OWNER}/${id}`); // partes não são mais necessárias
  }
}
