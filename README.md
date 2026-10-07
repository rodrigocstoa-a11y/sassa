# RRN Studio AI

Plataforma web (SaaS) para automatizar a produção de vídeos para YouTube: roteiro → áudio → imagens → montagem → publicação.
Tudo foi desenhado para rodar **online**, acessível pelo navegador de qualquer lugar. Seu computador só abre o site.

Este repositório está na **Fase 3.5**: base, dashboard, canais, roteiros, áudios e a **fundação para a nuvem**
(PostgreSQL, login, fila persistente, armazenamento S3/R2, orçamento). **Nada foi contratado nem publicado ainda.**
Para colocar online, veja [`docs/DEPLOY.md`](docs/DEPLOY.md) (passo a passo e custos) e [`docs/CLOUD_ARCHITECTURE.md`](docs/CLOUD_ARCHITECTURE.md).

## Estado atual (honesto)

| Módulo | Estado |
|---|---|
| Dashboard, Canais, Roteiros (com traduções vinculadas), Áudios (biblioteca, importação, player, download, aprovação), Configurações | **Funcionando**, com dados reais |
| Login, orçamento mensal, fila de trabalhos | **Funcionando** (testados com PostgreSQL real) |
| Armazenamento S3/R2 com envio direto do navegador | **Implementado**, testado contra um S3 *falso*; falta validar com o bucket real |
| Geração de roteiro por IA, tradução automática, narração (TTS), imagens | **Não conectados.** Só existem as interfaces e os pontos de injeção; as telas explicam o que falta |
| Imagens, Editor/render de vídeo (FFmpeg na nuvem), Fila (interface), YouTube | **Não implementados** (Fases 4 a 8). As páginas dizem isso |

Nenhum serviço pago é usado e nenhuma chave de API é necessária para desenvolver e testar.

## Requisitos

- **Node.js 22.13 ou superior** (https://nodejs.org) e npm 10+. Windows, macOS ou Linux.
- Não precisa de Docker, banco instalado nem serviços externos para desenvolver: o banco local é o **PGlite** (PostgreSQL embutido) e os arquivos ficam em `storage/`.

## Como executar (Windows, PowerShell)

```powershell
npm install
npm run dev
```

Abra **http://localhost:3000**. A API roda em `http://127.0.0.1:3001/api`. Em desenvolvimento o login fica **desligado**
(usuário local único). Os dados ficam em `data/pglite` e `storage/` (ignorados pelo git); apague essas pastas para zerar.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API + site em desenvolvimento (recarrega ao salvar) |
| `npm test` | Todos os testes (PGlite em memória): pacote compartilhado, API e site |
| `npm run typecheck` | Verificação de tipos |
| `npm run build` | Build de produção |
| `npm start` | Executa o build de produção |

Testar a API contra um **PostgreSQL real** (recomendado antes de publicar): aponte `TEST_DATABASE_URL` para um servidor
de testes (cada teste cria e apaga o próprio banco).
```powershell
$env:TEST_DATABASE_URL = "postgres://postgres:senha@localhost:5432/postgres"; npm test -w @rrn/api
```

## Como funciona na nuvem (resumo)

- **Site** (Next.js) é o único endereço público; repassa `/api/*` à **API** (NestJS) em tempo de execução (`API_URL`).
- **Login obrigatório** em produção: e-mail e senha (hash scrypt), sessão em cookie `HttpOnly`, bloqueio após 5 erros, verificação de origem. O administrador vem de `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Cada usuário só vê os próprios dados.
- **Arquivos grandes não passam pela API**: o navegador recebe uma URL assinada e envia direto ao **S3/R2**; a API confere tamanho e formato (pelos bytes) e só então cadastra. A leitura é por redirecionamento assinado.
- **Fila persistente** no PostgreSQL (`SELECT … FOR UPDATE SKIP LOCKED`): tentativas com espera crescente, retomada após queda do worker, cancelamento, vários workers. O worker é a mesma imagem com `ROLE=worker`.
- **Orçamento**: sem limite mensal definido, nenhuma ação paga roda. Cada ação mostra a estimativa e exige confirmação; o custo é registrado e o limite é respeitado.
- **Docker**: `apps/api/Dockerfile` (API e worker) e `apps/web/Dockerfile`; `docker-compose.yml` ensaia tudo localmente (PostgreSQL + MinIO). CI em `.github/workflows/ci.yml`.

## Roteiros

Cada roteiro pertence a um canal e tem título, idioma, tema, conteúdo (até 1.000.000 de caracteres) e status
**Rascunho → Em revisão → Aprovado**. Pesquisa sem acentos, filtros e traduções vinculadas ao original (uma por idioma, marcadas como
desatualizadas quando o original muda). Não há geração nem tradução automática: `POST /api/scripts/generate` responde 501.

## Áudios

- **Biblioteca** com pesquisa e filtros (canal, roteiro, idioma, status, aprovação), reprodução/pausa, download e aprovação.
- **Vínculo:** todo áudio pertence a um roteiro; canal e idioma vêm dele. Roteiro com áudios não pode ser excluído nem mudar de canal/idioma (409).
- **Entrada hoje:** importação de MP3, WAV, OGG, FLAC, M4A ou WebM (limite `AUDIO_MAX_MB`, padrão 1 GB).
- **Narração automática (desligada):** a tela mostra voz, velocidade e a divisão real do roteiro em partes. Sem provedor, a API responde 501 com a lista do que falta (documentação do Talkify Labs ou outro serviço, um adaptador `TtsProvider`, a chave no servidor e um orçamento definido).
- **Roteiros longos:** o texto é dividido no limite do provedor (parágrafo → frase → palavra) e processado na fila, uma parte por vez. Cada parte concluída fica salva: erros temporários são repetidos sozinhos; falhas definitivas viram "Erro" e "Tentar novamente" retoma da parte pendente. Partes só são juntadas automaticamente em WAV; os demais formatos dependem do FFmpeg (Fase 6/7). Esse pipeline foi validado só com um provedor falso **que existe apenas nos testes**.
- **Custo:** todo provedor TTS é obrigado a informar uma estimativa de custo (`estimateCostUsd`); a narração só começa com a sua confirmação e dentro do orçamento.

## Configuração

Veja [`.env.example`](.env.example): todos os nomes de variáveis, com explicação. Em desenvolvimento nada é obrigatório.
Na nuvem, `NODE_ENV=production` **exige** `APP_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`, e recusa `AUTH_MODE=off`.

## Estrutura

```
apps/
  api/            NestJS: auth, channels, scripts, audios, jobs (fila), budget, storage (local e S3), database (PostgreSQL/PGlite + migrações)
  web/            Next.js + Tailwind: layout, login, features/ (channels, scripts, audios, settings), proxy /api em runtime
packages/
  shared/         Schemas zod (validação idêntica no site e na API), módulos, interfaces de provedores, divisor de texto
docs/             ARCHITECTURE.md, CLOUD_ARCHITECTURE.md (comparação de serviços e custos), DEPLOY.md
```

Ainda **não existem**: workers de render com FFmpeg na nuvem (Fase 6), editor (Fase 7), YouTube (Fase 8), provedores de IA reais.
O agente local do Windows foi **descartado** do plano: nada depende do seu computador.

## Decisões

- **PostgreSQL em todo lugar** (PGlite no desenvolvimento, servidor real na nuvem), mesmo SQL e mesmos testes nos dois.
- **Fila própria no PostgreSQL** em vez de Redis/BullMQ: menos serviços para pagar e operar.
- **Orçamento com padrão seguro** (US$ 0 até você definir): evita cobranças por engano.
- **Login simples e sem cadastro público**; contas são criadas pelo administrador. OAuth/Google pode entrar depois.
