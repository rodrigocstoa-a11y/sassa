import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  countWords,
  normalizeForSearch,
  type ScriptDetail,
  type ScriptInput,
  type ScriptList,
  type ScriptListQuery,
  type ScriptTranslationInput,
} from '@rrn/shared';
import { OwnerContext } from '../auth/owner-context';
import { ChannelsService } from '../channels/channels.service';
import { ScriptsRepository, type ScriptWrite } from './scripts.repository';

const invalid = (path: string, message: string) =>
  new BadRequestException({ message: 'Dados inválidos', issues: [{ path, message }] });

@Injectable()
export class ScriptsService {
  constructor(
    private readonly repo: ScriptsRepository,
    private readonly channels: ChannelsService,
    private readonly owner: OwnerContext,
  ) {}

  list(query: ScriptListQuery): Promise<ScriptList> {
    return this.repo.list(this.owner.current(), query);
  }

  count() {
    return this.repo.count(this.owner.current());
  }

  async get(id: string): Promise<ScriptDetail> {
    const ownerId = this.owner.current();
    const script = await this.repo.find(ownerId, id);
    if (!script) throw new NotFoundException('Roteiro não encontrado');
    const source = script.sourceScriptId ? await this.repo.find(ownerId, script.sourceScriptId) : undefined;
    const { content: _c, ...sourceSummary } = source ?? ({} as NonNullable<typeof source>);
    return {
      ...script,
      source: source ? sourceSummary : null,
      translations: script.sourceScriptId ? [] : await this.repo.translationsOf(ownerId, id),
      outdated: !!source && source.updatedAt > script.updatedAt,
    };
  }

  async create(input: ScriptInput): Promise<ScriptDetail> {
    await this.assertChannel(input.channelId);
    const created = await this.repo.create(this.owner.current(), { ...this.toWrite(input, null), sourceScriptId: null });
    return this.get(created.id);
  }

  async update(id: string, input: ScriptInput): Promise<ScriptDetail> {
    const ownerId = this.owner.current();
    const existing = await this.get(id);
    if (input.channelId !== existing.channelId) await this.assertChannel(input.channelId);

    if (existing.sourceScriptId) {
      if (input.channelId !== existing.channelId) throw invalid('channelId', 'Uma tradução mantém o canal do roteiro original');
      if (input.language !== existing.language) throw invalid('language', 'Uma tradução mantém o idioma com que foi criada');
    } else if (
      existing.translations.length > 0 &&
      (input.channelId !== existing.channelId || input.language !== existing.language)
    ) {
      throw new ConflictException('Este roteiro tem traduções vinculadas: não é possível mudar o canal ou o idioma.');
    }
    if (
      (input.channelId !== existing.channelId || input.language !== existing.language) &&
      (await this.repo.countAudios(ownerId, id)) > 0
    ) {
      throw new ConflictException('Este roteiro tem áudios vinculados: não é possível mudar o canal ou o idioma.');
    }

    const approvedAt = input.status === 'approved' ? (existing.approvedAt ?? new Date().toISOString()) : null;
    await this.repo.update(ownerId, id, this.toWrite(input, approvedAt));
    return this.get(id);
  }

  async remove(id: string) {
    const ownerId = this.owner.current();
    const existing = await this.get(id);
    if (existing.translations.length > 0) {
      throw new ConflictException('Este roteiro tem traduções vinculadas. Exclua as traduções antes de excluir o original.');
    }
    if ((await this.repo.countAudios(ownerId, id)) > 0) {
      throw new ConflictException('Este roteiro possui áudios vinculados. Exclua os áudios antes de excluir o roteiro.');
    }
    await this.repo.remove(ownerId, id);
  }

  /** Cria uma tradução vazia (rascunho) vinculada ao original. O texto traduzido é colado/escrito depois. */
  async createTranslation(sourceId: string, { language }: ScriptTranslationInput): Promise<ScriptDetail> {
    const source = await this.get(sourceId);
    if (source.sourceScriptId) throw new BadRequestException('Só é possível traduzir o roteiro original, não uma tradução.');
    if (language === source.language) throw invalid('language', 'A tradução deve estar em um idioma diferente do original');
    if (source.translations.some((t) => t.language === language)) {
      throw new ConflictException('Já existe uma tradução neste idioma para este roteiro.');
    }
    const created = await this.repo.create(this.owner.current(), {
      ...this.toWrite(
        { channelId: source.channelId, title: source.title, language, topic: source.topic, content: '', status: 'draft' },
        null,
      ),
      sourceScriptId: source.id,
    });
    return this.get(created.id);
  }

  private async assertChannel(channelId: string) {
    try {
      await this.channels.get(channelId);
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
