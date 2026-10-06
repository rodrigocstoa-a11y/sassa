# RRN Studio AI

Plataforma para automatizar a produção de vídeos para YouTube: roteiro → áudio → imagens → montagem → publicação.
Este repositório está na **Fase 2**: base, dashboard, canais e roteiros.

## Estado atual (honesto)

| Módulo | Estado |
|---|---|
| Dashboard, Canais (CRUD), Configurações | **Funcionando**, com dados reais (SQLite local) |
| Roteiros (criar, editar, excluir, pesquisar, status, traduções vinculadas) | **Funcionando**. A geração por IA **não está configurada** (a interface avisa e o endpoint responde 501) |
| Áudios, Imagens, Editor, Fila, YouTube, Agente local | **Não implementados**. As páginas dizem isso explicitamente |
| Provedores de IA (LLM, TTS/Talkify Labs, imagens) | **Nenhum integrado.** Só existem as interfaces em `packages/shared/src/providers.ts` e o ponto de injeção `LLM_PROVIDER` (valor `null`) em `apps/api/src/scripts` |

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

## Decisões desta fase

- **SQLite embutido do Node** em vez de Prisma/Docker/Postgres: zero dependências nativas e custo zero. O acesso passa por um repositório abstrato (`ChannelsRepository`), então PostgreSQL na nuvem entra como novo adaptador.
- **Preparado para multiusuário:** cada canal tem `owner_id` (hoje sempre `local`). Autenticação virá antes de qualquer publicação na nuvem. **Hoje a API não tem login e só escuta em 127.0.0.1; não a exponha à internet.**
- **Sem CORS e sem chaves no navegador:** o navegador só fala com o Next, que repassa `/api/*` para a API.
- **Redis/BullMQ adiado** até a Fase 5 (fila), para não exigir serviços agora.
