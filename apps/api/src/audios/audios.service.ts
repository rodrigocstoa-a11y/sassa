import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AUDIO_FORMATS,
  normalizeForSearch,
  type AudioList,
  type AudioListQuery,
  type AudioSummary,
  type AudioUpdateInput,
  type AudioUploadInit,
  type AudioUploadTarget,
} from '@rrn/shared';
import { audioMaxBytes } from '../config';
import { OwnerContext } from '../auth/owner-context';
import { ScriptsService } from '../scripts/scripts.service';
import { ObjectStorage, type ReadTarget } from '../storage/object-storage';
import { signTicket, verifyTicket } from '../storage/tickets';
import { extForMime, mimeFor, sniffAudioFormat } from './audio-format';
import { AudiosRepository, type AudioRecord } from './audios.repository';

const invalid = (path: string, message: string) =>
  new BadRequestException({ message: 'Dados inválidos', issues: [{ path, message }] });

const toSummary = ({ fileKey: _k, ...summary }: AudioRecord): AudioSummary => summary;

const UPLOAD_TTL_SEC = 3600;

interface UploadTicket {
  o: string; // dono
  k: string; // chave no armazenamento
  s: string; // roteiro
  t: string; // título
  f?: string; // nome original
  d?: number; // duração informada pelo navegador
  z: number; // tamanho declarado
}

export interface AudioFile {
  target: ReadTarget;
  mimeType: string;
  downloadName: string;
}

@Injectable()
export class AudiosService {
  constructor(
    private readonly repo: AudiosRepository,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    private readonly scripts: ScriptsService,
    private readonly owner: OwnerContext,
  ) {}

  /** A pesquisa de texto é feita aqui (sem acentos/caixa); os demais filtros e a ordenação, no banco. */
  async list(query: AudioListQuery): Promise<AudioList> {
    const { q, limit, offset, ...filters } = query;
    let rows = await this.repo.list(this.owner.current(), filters);
    const terms = normalizeForSearch(q ?? '').split(/\s+/).filter(Boolean);
    if (terms.length) {
      rows = rows.filter((a) => {
        const hay = normalizeForSearch([a.title, a.scriptTitle, a.channelName, a.originalFilename, a.voiceName].filter(Boolean).join('\n'));
        return terms.every((t) => hay.includes(t));
      });
    }
    return { items: rows.slice(offset, offset + limit).map(toSummary), total: rows.length };
  }

  count() {
    return this.repo.count(this.owner.current());
  }

  async record(id: string): Promise<AudioRecord> {
    const rec = await this.repo.find(this.owner.current(), id);
    if (!rec) throw new NotFoundException('Áudio não encontrado');
    return rec;
  }

  async get(id: string): Promise<AudioSummary> {
    return toSummary(await this.record(id));
  }

  /** Etapa 1: valida o pedido e devolve uma URL assinada para o navegador enviar o arquivo direto ao armazenamento. */
  async initUpload(input: AudioUploadInit): Promise<AudioUploadTarget> {
    const script = await this.getScript(input.scriptId);
    const max = audioMaxBytes();
    if (input.size > max) throw new PayloadTooLargeException(`Arquivo maior que o limite de ${Math.floor(max / 1024 / 1024)} MB`);
    const ownerId = this.owner.current();
    const key = `audio/${ownerId}/${randomUUID()}`;
    const contentType = input.contentType || 'application/octet-stream';
    const target = await this.storage.createUploadTarget(key, { contentType, expiresInSec: UPLOAD_TTL_SEC, maxBytes: input.size });
    const uploadToken = signTicket<UploadTicket>(
      { o: ownerId, k: key, s: script.id, t: input.title, f: input.filename, d: input.durationMs, z: input.size },
      UPLOAD_TTL_SEC,
    );
    return { uploadUrl: target.url, method: target.method, headers: target.headers, uploadToken, expiresInSec: UPLOAD_TTL_SEC };
  }

  /** Etapa 2: confere o arquivo enviado (existência, tamanho e formato pelos bytes) e cria o registro. */
  async completeUpload(uploadToken: string): Promise<AudioSummary> {
    const ownerId = this.owner.current();
    const t = verifyTicket<UploadTicket>(uploadToken);
    if (!t || t.o !== ownerId) throw new BadRequestException('Token de envio inválido ou expirado');

    const existing = await this.repo.findByFileKey(ownerId, t.k); // idempotente
    if (existing) return toSummary(existing);

    const script = await this.getScript(t.s);
    const head = await this.storage.head(t.k);
    if (!head) throw new BadRequestException('O arquivo ainda não foi enviado');
    if (head.size !== t.z || head.size > audioMaxBytes()) {
      await this.storage.delete(t.k);
      throw new BadRequestException('O tamanho do arquivo enviado não confere com o informado');
    }
    const ext = sniffAudioFormat(await this.storage.readRange(t.k, 0, 15));
    if (!ext) {
      await this.storage.delete(t.k);
      throw new UnsupportedMediaTypeException(`Formato de áudio não reconhecido. Formatos aceitos: ${AUDIO_FORMATS.map((f) => f.label).join(', ')}.`);
    }
    try {
      return toSummary(
        await this.repo.create(ownerId, {
          channelId: script.channelId,
          scriptId: script.id,
          title: t.t,
          language: script.language,
          status: 'completed',
          source: 'upload',
          fileKey: t.k,
          mimeType: mimeFor(ext),
          sizeBytes: head.size,
          durationMs: t.d ?? null,
          originalFilename: t.f ?? null,
        }),
      );
    } catch (err) {
      await this.storage.delete(t.k);
      throw err;
    }
  }

  async update(id: string, input: AudioUpdateInput): Promise<AudioSummary> {
    const rec = await this.record(id);
    if (input.approved && rec.status !== 'completed') throw invalid('approved', 'Só é possível aprovar um áudio concluído');
    const approvedAt = input.approved ? (rec.approvedAt ?? new Date().toISOString()) : null;
    return toSummary((await this.repo.update(this.owner.current(), id, { title: input.title, approvedAt }))!);
  }

  async remove(id: string) {
    const rec = await this.record(id);
    if (rec.status === 'processing') throw new ConflictException('Este áudio está sendo processado. Aguarde o término para excluir.');
    await this.repo.remove(this.owner.current(), id);
    if (rec.fileKey) await this.storage.delete(rec.fileKey);
    await this.storage.deletePrefix(`audio/${rec.ownerId}/${id}/`); // partes de narrações geradas
  }

  async fileFor(id: string, download: boolean): Promise<AudioFile> {
    const rec = await this.record(id);
    if (!rec.hasFile || !rec.fileKey) throw new NotFoundException('Este áudio não possui arquivo disponível');
    const mimeType = rec.mimeType ?? 'application/octet-stream';
    const ext = extForMime(mimeType) ?? 'bin';
    const safe = rec.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'audio';
    const downloadName = `${safe}.${ext}`;
    const target = await this.storage.createReadTarget(rec.fileKey, { contentType: mimeType, downloadName: download ? downloadName : undefined, expiresInSec: 900 });
    return { target, mimeType, downloadName };
  }

  private async getScript(scriptId: string) {
    try {
      return await this.scripts.get(scriptId);
    } catch {
      throw invalid('scriptId', 'Roteiro não encontrado');
    }
  }
}
