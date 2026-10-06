import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  countWords,
  normalizeForSearch,
  type ScriptDetail,
  type ScriptInput,
  type ScriptListQuery,
  type ScriptTranslationInput,
} from '@rrn/shared';
import { ChannelsService, LOCAL_OWNER } from '../channels/channels.service';
import { ScriptsRepository, type ScriptWrite } from './scripts.repository';

const invalid = (path: string, message: string) =>
  new BadRequestException({ message: 'Dados inválidos', issues: [{ path, message }] });

@Injectable()
export class ScriptsService {
  constructor(
    private readonly repo: ScriptsRepository,
    private readonly channels: ChannelsService,
  ) {}

  list(query: ScriptListQuery) {
    return this.repo.list(LOCAL_OWNER, query);
  }

  count() {
    return this.repo.count(LOCAL_OWNER);
  }

  get(id: string): ScriptDetail {
    const script = this.repo.find(LOCAL_OWNER, id);
    if (!script) throw new NotFoundException('Roteiro não encontrado');
    const source = script.sourceScriptId ? this.repo.find(LOCAL_OWNER, script.sourceScriptId) : undefined;
    const { content: _c, ...sourceSummary } = source ?? ({} as NonNullable<typeof source>);
    return {
      ...script,
      source: source ? sourceSummary : null,
      translations: script.sourceScriptId ? [] : this.repo.translationsOf(LOCAL_OWNER, id),
      outdated: !!source && source.updatedAt > script.updatedAt,
    };
  }

  create(input: ScriptInput): ScriptDetail {
    this.assertChannel(input.channelId);
    const created = this.repo.create(LOCAL_OWNER, { ...this.toWrite(input, null), sourceScriptId: null });
    return this.get(created.id);
  }

  update(id: string, input: ScriptInput): ScriptDetail {
    const existing = this.get(id);
    if (input.channelId !== existing.channelId) this.assertChannel(input.channelId);

    if (existing.sourceScriptId) {
      if (input.channelId !== existing.channelId) throw invalid('channelId', 'Uma tradução mantém o canal do roteiro original');
      if (input.language !== existing.language) throw invalid('language', 'Uma tradução mantém o idioma com que foi criada');
    } else if (
      existing.translations.length > 0 &&
      (input.channelId !== existing.channelId || input.language !== existing.language)
    ) {
      throw new ConflictException('Este roteiro tem traduções vinculadas: não é possível mudar o canal ou o idioma.');
    }

    const approvedAt = input.status === 'approved' ? (existing.approvedAt ?? new Date().toISOString()) : null;
    this.repo.update(LOCAL_OWNER, id, this.toWrite(input, approvedAt));
    return this.get(id);
  }

  remove(id: string) {
    const existing = this.get(id);
    if (existing.translations.length > 0) {
      throw new ConflictException('Este roteiro tem traduções vinculadas. Exclua as traduções antes de excluir o original.');
    }
    this.repo.remove(LOCAL_OWNER, id);
  }

  /** Cria uma tradução vazia (rascunho) vinculada ao original. O texto traduzido é colado/escrito depois. */
  createTranslation(sourceId: string, { language }: ScriptTranslationInput): ScriptDetail {
    const source = this.get(sourceId);
    if (source.sourceScriptId) throw new BadRequestException('Só é possível traduzir o roteiro original, não uma tradução.');
    if (language === source.language) throw invalid('language', 'A tradução deve estar em um idioma diferente do original');
    if (source.translations.some((t) => t.language === language)) {
      throw new ConflictException('Já existe uma tradução neste idioma para este roteiro.');
    }
    const created = this.repo.create(LOCAL_OWNER, {
      ...this.toWrite(
        { channelId: source.channelId, title: source.title, language, topic: source.topic, content: '', status: 'draft' },
        null,
      ),
      sourceScriptId: source.id,
    });
    return this.get(created.id);
  }

  private assertChannel(channelId: string) {
    try {
      this.channels.get(channelId);
    } catch {
      throw invalid('channelId', 'Canal não encontrado');
    }
  }

  private toWrite(input: ScriptInput, approvedAt: string | null): ScriptWrite {
    return {
      ...input,
      wordCount: countWords(input.content),
      searchText: normalizeForSearch(`${input.title}\n${input.topic}\n${input.content}`),
      approvedAt,
    };
  }
}
