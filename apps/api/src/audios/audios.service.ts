import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  AUDIO_FORMATS,
  normalizeForSearch,
  type AudioList,
  type AudioListQuery,
  type AudioSummary,
  type AudioUpdateInput,
  type AudioUploadQuery,
} from '@rrn/shared';
import { audioMaxBytes } from '../config';
import { LOCAL_OWNER } from '../channels/channels.service';
import { ScriptsService } from '../scripts/scripts.service';
import { extForMime, mimeFor, sniffAudioFormat } from './audio-format';
import { AudioStorage } from './audio-storage';
import { AudiosRepository, type AudioRecord } from './audios.repository';

const invalid = (path: string, message: string) =>
  new BadRequestException({ message: 'Dados inválidos', issues: [{ path, message }] });

const toSummary = ({ fileKey: _k, ...summary }: AudioRecord): AudioSummary => summary;

export interface AudioFile {
  path: string;
  mimeType: string;
  downloadName: string;
}

@Injectable()
export class AudiosService {
  constructor(
    private readonly repo: AudiosRepository,
    private readonly storage: AudioStorage,
    private readonly scripts: ScriptsService,
  ) {}

  /** A pesquisa de texto é feita aqui (sem acentos/caixa); os demais filtros e a ordenação, no banco. */
  list(query: AudioListQuery): AudioList {
    const { q, limit, offset, ...filters } = query;
    let rows = this.repo.list(LOCAL_OWNER, filters);
    const terms = normalizeForSearch(q ?? '').split(/\s+/).filter(Boolean);
    if (terms.length) {
      rows = rows.filter((a) => {
        const hay = normalizeForSearch(
          [a.title, a.scriptTitle, a.channelName, a.originalFilename, a.voiceName].filter(Boolean).join('\n'),
        );
        return terms.every((t) => hay.includes(t));
      });
    }
    return { items: rows.slice(offset, offset + limit).map(toSummary), total: rows.length };
  }

  count() {
    return this.repo.count(LOCAL_OWNER);
  }

  record(id: string): AudioRecord {
    const rec = this.repo.find(LOCAL_OWNER, id);
    if (!rec) throw new NotFoundException('Áudio não encontrado');
    return rec;
  }

  get(id: string): AudioSummary {
    return toSummary(this.record(id));
  }

  /** Importa um arquivo de áudio produzido fora da plataforma. O corpo da requisição é o arquivo. */
  async importUpload(q: AudioUploadQuery, body: Readable, contentLength: number | undefined): Promise<AudioSummary> {
    const script = this.getScript(q.scriptId);
    const max = audioMaxBytes();
    if (contentLength !== undefined && contentLength > max) {
      throw new PayloadTooLargeException(`Arquivo maior que o limite de ${Math.floor(max / 1024 / 1024)} MB`);
    }

    const temp = await this.storage.writeTemp(body, max);
    const ext = temp.size > 0 ? sniffAudioFormat(temp.head) : null;
    if (!ext) {
      await this.storage.discard(temp.tempKey);
      if (temp.size === 0) throw new BadRequestException('Arquivo vazio');
      throw new UnsupportedMediaTypeException(
        `Formato de áudio não reconhecido. Formatos aceitos: ${AUDIO_FORMATS.map((f) => f.label).join(', ')}.`,
      );
    }

    const fileKey = `audio/${LOCAL_OWNER}/${randomUUID()}.${ext}`;
    await this.storage.commit(temp.tempKey, fileKey);
    try {
      const rec = this.repo.create(LOCAL_OWNER, {
        channelId: script.channelId,
        scriptId: script.id,
        title: q.title,
        language: script.language,
        status: 'completed',
        source: 'upload',
        fileKey,
        mimeType: mimeFor(ext),
        sizeBytes: temp.size,
        durationMs: q.durationMs ?? null,
        originalFilename: q.filename ?? null,
      });
      return toSummary(rec);
    } catch (err) {
      await this.storage.delete(fileKey);
      throw err;
    }
  }

  update(id: string, input: AudioUpdateInput): AudioSummary {
    const rec = this.record(id);
    if (input.approved && rec.status !== 'completed') throw invalid('approved', 'Só é possível aprovar um áudio concluído');
    const approvedAt = input.approved ? (rec.approvedAt ?? new Date().toISOString()) : null;
    return toSummary(this.repo.update(LOCAL_OWNER, id, { title: input.title, approvedAt })!);
  }

  async remove(id: string) {
    const rec = this.record(id);
    if (rec.status === 'processing') throw new ConflictException('Este áudio está sendo processado. Aguarde o término para excluir.');
    this.repo.remove(LOCAL_OWNER, id);
    if (rec.fileKey) await this.storage.delete(rec.fileKey);
    await this.storage.delete(`audio/${LOCAL_OWNER}/${id}`); // partes de narrações geradas
  }

  fileFor(id: string): AudioFile {
    const rec = this.record(id);
    if (!rec.hasFile || !rec.fileKey) throw new NotFoundException('Este áudio não possui arquivo disponível');
    const ext = extForMime(rec.mimeType ?? '') ?? 'bin';
    const safe = rec.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'audio';
    return { path: this.storage.resolve(rec.fileKey), mimeType: rec.mimeType ?? 'application/octet-stream', downloadName: `${safe}.${ext}` };
  }

  private getScript(scriptId: string) {
    try {
      return this.scripts.get(scriptId);
    } catch {
      throw invalid('scriptId', 'Roteiro não encontrado');
    }
  }
}
