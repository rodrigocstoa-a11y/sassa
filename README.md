# RRN Studio AI

Plataforma para automatizar a produção de vídeos para YouTube: roteiro → áudio → imagens → montagem → publicação.
Este repositório está na **Fase 3**: base, dashboard, canais, roteiros e áudios.

## Estado atual (honesto)

| Módulo | Estado |
|---|---|
| Dashboard, Canais (CRUD), Configurações | **Funcionando**, com dados reais (SQLite local) |
| Roteiros (criar, editar, excluir, pesquisar, status, traduções vinculadas) | **Funcionando**. A geração por IA **não está configurada** (a interface avisa e o endpoint responde 501) |
| Áudios (biblioteca, importação, player, download, aprovação, filtros) | **Funcionando** com arquivos reais. A **narração automática não está configurada** (a interface explica o que falta; a API responde 501) |
| Imagens, Editor, Fila, YouTube, Agente local | **Não implementados**. As páginas dizem isso explicitamente |
| Provedores de IA (LLM, TTS/Talkify Labs, imagens) | **Nenhum integrado.** Só existem as interfaces em `packages/shared/src/providers.ts` e os pontos de injeção `LLM_PROVIDER` e `TTS_PROVIDER` (valor `null`) em `apps/api/src/scripts` e `apps/api/src/audios` |

Nenhum serviço pago é usado e nenhuma chave de API é necessária.

## Requisitos

- **Node.js 22.13 ou superior** (https://nodejs.org). O banco usa o SQLite embutido do Node, sem instalar nada nativo.
- npm 10+ (vem com o Node). Funciona em Windows, macOS e Linux.

## Como executar (Windows, PowerShell)

```powershell
npm install
npm run dev
```

Abra **http://localhost:3000**. A API roda em `http://127.0.0.1:3001/api` (apenas loopback, não exposta na rede).
Os dados ficam em `data/rrn-studio.db` (ignorado pelo git). Para zerar, pare o sistema e apague esse arquivo.

> O Node mostra um aviso `ExperimentalWarning: SQLite`. É esperado e inofensivo.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API + web em modo desenvolvimento (recarrega ao salvar) |
| `npm test` | Testes do pacote compartilhado, da API (CRUD via HTTP) e do web |
| `npm run typecheck` | Verificação de tipos de tudo |
| `npm run build` | Build de produção |
| `npm start` | Executa o build de produção (rode `npm run build` antes) |

## Configuração (opcional)

As variáveis são lidas do ambiente do processo (não há `.env` carregado automaticamente; `.env.example` só documenta os nomes):
`PORT` (padrão 3001), `DATABASE_PATH` (padrão `data/rrn-studio.db`) e, no web, `API_URL` (padrão `http://127.0.0.1:3001`).

## Estrutura

```
apps/
  api/            NestJS: módulos channels, system (health, summary, providers), database (SQLite + migrações)
  web/            Next.js + Tailwind: layout, componentes de UI, features/ (channels, dashboard, settings)
packages/
  shared/         Schemas zod (validação idêntica no front e no back), lista de módulos, interfaces de provedores
docs/             Arquitetura e decisões
data/             Banco local (não versionado)
```

Ainda **não existem**: `apps/local-agent` (Fase 6), fila (Fase 5), `storage/` de mídia (Fases 3-4).

## Roteiros (Fase 2)

- Cada roteiro pertence a um canal e tem título, idioma, tema, conteúdo (até 1.000.000 de caracteres) e status: **Rascunho → Em revisão → Aprovado**. Revisão e aprovação exigem conteúdo.
- **Pesquisa** em título, tema e conteúdo, sem diferenciar acentos nem maiúsculas, com filtros por canal, status e idioma.
- **Traduções:** uma tradução é um roteiro vinculado ao original (um por idioma). Ela é criada vazia e o texto traduzido é colado/escrito no editor; **não há tradução automática**. A tradução é marcada como desatualizada se o original for editado depois dela.
- Integridade: canal com roteiros e original com traduções não podem ser excluídos (a API responde 409); traduções mantêm o canal e o idioma do original.
- **Ctrl+S** salva no editor; o navegador avisa se você fechar com alterações não salvas.
- **Geração por IA:** o contrato (`POST /api/scripts/generate`) existe e valida o pedido, mas sem provedor responde **501**; nunca devolve texto simulado.

## Áudios (Fase 3)

- **Biblioteca:** pesquisa (título, roteiro, canal, arquivo; sem acentos) e filtros por canal, roteiro, idioma, status e aprovação. Reproduzir/pausar na lista, player completo com avanço/retrocesso na página do áudio, download e exclusão.
- **Vínculo:** todo áudio pertence a um **roteiro**; o canal e o idioma vêm dele. Roteiro com áudios não pode ser excluído nem mudar de canal/idioma (409). Se o roteiro for editado depois do áudio, aparece o aviso "roteiro alterado".
- **Como entram áudios hoje:** por **importação** (MP3, WAV, OGG, FLAC, M4A, WebM), validada pelos bytes do arquivo, não pela extensão. Não existe geração automática: nenhum áudio é criado ou simulado sem arquivo real.
- **Armazenamento:** metadados no SQLite; arquivos em `storage/audio/` (fora do git; mude com `STORAGE_PATH`). Nomes gerados pelo servidor. Limite de envio: 1 GB (`AUDIO_MAX_MB`). A interface `AudioStorage` permite trocar por S3/R2 na nuvem.
- **Envio de arquivos grandes:** o navegador envia direto para a API (o proxy do Next trunca corpos acima de 10 MB). A API aceita CORS apenas das origens em `WEB_ORIGINS` (padrão `http://localhost:3000,http://127.0.0.1:3000`). A URL direta pode ser mudada com `NEXT_PUBLIC_API_URL` (padrão `http://127.0.0.1:3001`; não é segredo).
- **Estados:** Processando, Concluído e Erro. "Processando" só aparece para trabalho realmente em andamento; se o servidor reiniciar, ele vira Erro. Só áudios concluídos podem ser aprovados.
- **Narração automática (desligada):** a tela "Gerar narração" mostra idioma, voz, velocidade e uma pré-visualização real da divisão do roteiro em partes. Sem provedor, a API responde 501 com a lista do que falta: documentação do Talkify Labs (ou outro serviço), um adaptador `TtsProvider` registrado em `TTS_PROVIDER`, a chave de API no servidor e sua aprovação de custos.
- **Roteiros longos:** o roteiro é dividido em partes dentro do limite do provedor (parágrafo → frase → palavra). Cada parte concluída é salva; se uma parte falhar, "Tentar novamente" retoma dela. Partes só são juntadas automaticamente em WAV; outros formatos dependem do FFmpeg (Fase 7). Esse pipeline foi validado nos testes com um provedor falso que **não existe na aplicação**.

## Decisões desta fase

- **SQLite embutido do Node** em vez de Prisma/Docker/Postgres: zero dependências nativas e custo zero. O acesso passa por um repositório abstrato (`ChannelsRepository`), então PostgreSQL na nuvem entra como novo adaptador.
- **Preparado para multiusuário:** cada canal tem `owner_id` (hoje sempre `local`). Autenticação virá antes de qualquer publicação na nuvem. **Hoje a API não tem login e só escuta em 127.0.0.1; não a exponha à internet.**
- **Sem CORS e sem chaves no navegador:** o navegador só fala com o Next, que repassa `/api/*` para a API.
- **Redis/BullMQ adiado** até a Fase 5 (fila), para não exigir serviços agora.
