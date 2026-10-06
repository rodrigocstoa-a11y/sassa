# RRN Studio AI: arquitetura 100% online (proposta para aprovação)

> Status: **proposta**. Nada foi contratado, ativado ou implementado. Os preços foram levantados em
> pesquisa na web em outubro/2026, em parte por sites agregadores, e **precisam ser conferidos nas
> páginas oficiais antes de qualquer contratação**.

## 1. Requisito

O PC do usuário só abre o site. Nenhuma função depende dele: nem renderização, nem FFmpeg, nem IA local,
nem agente instalado. Tudo roda em serviços na nuvem, acessível de qualquer lugar pelo navegador.

**Consequência:** o "agente local do Windows" (antiga Fase 6) deixa de existir. A renderização passa a ser
feita por **workers efêmeros na nuvem** com FFmpeg em contêiner.

## 2. Visão geral

```
Navegador (qualquer lugar)
   │ HTTPS
   ▼
┌───────────────┐   HTTPS    ┌─────────────────────────┐        ┌──────────────────────┐
│ Web (Next.js) │ ─────────▶ │ API (NestJS, contêiner) │ ─────▶ │ PostgreSQL gerenciado │
└───────────────┘            │ auth · regras · orçamento│        │ dados + fila (pg-boss)│
        │                    └───────┬─────────┬────────┘        └──────────────────────┘
        │ URLs assinadas             │ enfileira│ URLs assinadas
        ▼                            ▼          ▼
┌──────────────────────┐   ┌─────────────────┐  ┌──────────────────────────────────┐
│ Object Storage (R2)  │◀──│ Worker "geral"   │  │ Workers de RENDER (efêmeros)     │
│ roteiros·áudio·img·  │   │ roteiro/áudio/   │  │ contêiner com FFmpeg, N em       │
│ vídeo (egress grátis)│   │ imagem/YouTube   │  │ paralelo, desligam ao terminar   │
└──────────────────────┘   └───────┬─────────┘  └──────────────────────────────────┘
                                   ▼
        Provedores online por adaptador: LLM · TTS · Imagens · YouTube Data API
```

Princípios: (1) arquivos grandes **nunca** passam pela API: o navegador e os workers falam direto com o
storage por URLs assinadas; (2) todo trabalho longo é um **job persistido** (estado, progresso, retry);
(3) segredos só no servidor; (4) cada provedor externo é um **adaptador** trocável; (5) **nenhum gasto sem
aprovação**: orçamento e confirmação embutidos no produto.

## 3. Comparação de serviços por camada

### Frontend e API
| Opção | Prós | Contras | Custo (pesquisado) |
|---|---|---|---|
| **Railway** (web + API + worker + Postgres) | Tudo num painel, Docker, cobrança por uso, simples | Menos maduro que gigantes; egress US$ 0,05/GB | US$ 20/vCPU·mês, US$ 10/GB RAM·mês; Hobby US$ 5, Pro US$ 20 (inclui US$ 20 de uso) |
| **Vercel** (web) + Railway/Fly (API) | Melhor experiência para Next.js | Pro US$ 20/mês por usuário; plano Hobby é de uso não comercial | Pro US$ 20/mês |
| **Fly.io** | Docker, regiões, **Machines API** para criar/destruir workers por segundo | Mais operação manual | Cobrança por segundo; performance-1x (1 vCPU, 2 GB) US$ 0,0458/h |
| **Render** | Simples, workers e cron nativos | Plano fixo por serviço | Workspace Pro US$ 25 + serviços (a partir de US$ 7/mês) |
| **Hetzner (VPS)** | Preço baixo historicamente | Em 2026 as linhas de vCPU dedicada subiram muito (CCX13 €42,99/mês, CCX23 €85,99/mês); você opera tudo | Fixo, pago mesmo ocioso |

### Banco de dados (e fila)
| Opção | Observação |
|---|---|
| **PostgreSQL no Railway** | ~US$ 5–10/mês por uso; suficiente no início; fila via **pg-boss** (sem Redis) |
| **Neon** | Grátis (0,5 GB) ou Launch (US$ 0,106/CU·h, US$ 0,35/GB·mês). Escala a zero, mas fila com *polling* mantém o banco acordado (~US$ 19/mês com 0,25 CU) |
| **Supabase Pro** | US$ 25/mês (8 GB, US$ 10 de crédito de computação, **Auth incluso**) |
| Redis + BullMQ (Upstash) | US$ 0,20 / 100 mil comandos; BullMQ consulta o tempo todo e pode ficar caro. **Não recomendado** nesta escala |

### Armazenamento de objetos
| Opção | Armazenamento | Saída (egress) | Observação |
|---|---|---|---|
| **Cloudflare R2** | US$ 0,015/GB·mês (10 GB grátis) | **Grátis** | Compatível com S3, suporta Range e URLs assinadas |
| Backblaze B2 | US$ 0,00695/GB·mês | Grátis até 3× o armazenado | Metade do preço do R2; boa opção para arquivo |
| AWS S3 | (não pesquisado) | Cobrado | Mais caro para vídeo |

### Render de vídeo com FFmpeg (nuvem)
| Opção | Prós | Contras |
|---|---|---|
| **Fly Machines efêmeras** | Cria N máquinas por API, cobra por segundo, desliga sozinhas | Você mantém a imagem Docker |
| Railway (serviço de worker) | Mais simples, mesmo painel | Escalar para N paralelos é menos direto |
| Google Cloud Run Jobs / AWS Batch | Maduros, paralelismo nativo | Mais configuração; preços não verificados nesta pesquisa |
| APIs de vídeo prontas (Shotstack, Creatomate) | Zero infraestrutura | Cobram por minuto renderizado, menos controle, dependência; **não pesquisado** |
| VPS fixo 24h | Previsível | Paga ocioso; vCPU dedicada ficou cara em 2026 |

### Provedores de IA (adaptadores)
| Função | Opções e preço de referência |
|---|---|
| **LLM (roteiro, prompts de cena, tradução)** | Claude Haiku 4.5 US$ 1/5, Sonnet 4.6 US$ 3/15, Opus 4.8 US$ 5/25 (por milhão de tokens, entrada/saída; modelos mais novos podem ter outro preço); lote −50%, cache −90% |
| **Voz (TTS)** | ElevenLabs US$ 0,10/1 mil caracteres (Flash US$ 0,05) · OpenAI gpt-4o-mini-tts ≈ US$ 0,015/min · Google Chirp 3 HD US$ 30/M car., Neural2 US$ 16/M, Standard US$ 4/M · Speechify desde US$ 6/M car. · **Talkify Labs: não encontrei documentação nem preço**, preciso do material que você tiver |
| **Imagens** | FLUX schnell ≈ US$ 0,003/img (Replicate, fal.ai) · gpt-image-1.5 de US$ 0,009 (baixa) a US$ 0,04 (padrão) · Imagen 4 Fast US$ 0,02, Standard US$ 0,04, Ultra US$ 0,06 |
| **YouTube Data API** | Gratuita. Cota padrão 10.000 unidades/dia; `videos.insert` custa ~100 unidades (reduzido em dez/2025) |

## 4. Recomendação

**Pilha enxuta para começar (Opção A)**
- **Web, API e worker geral:** Railway (contêineres Docker, Node 22).
- **Banco + fila:** PostgreSQL (Railway; ou Supabase Pro se quiser login pronto) com **pg-boss**.
- **Arquivos:** Cloudflare R2.
- **Render:** workers FFmpeg efêmeros no **Fly.io Machines**, em paralelo por cena.
- **IA:** adaptadores; começar pelo perfil econômico e subir de qualidade por canal.

**Pilha gerenciada (Opção B):** Vercel (web) + Railway (API) + Neon/Supabase. Mais confortável, ~US$ 20–40/mês a mais.

Ambas mantêm Docker, então migrar entre provedores é trabalho de horas, não de reescrita.

## 5. Renderização de vídeos de 2 horas

Medição real de FFmpeg (x264 veryfast, CRF 23, 1080p30, efeito Ken Burns com `zoompan`, legenda queimada),
em um servidor de teste modesto e compartilhado (4 vCPU Xeon 2,1 GHz):

| Teste | Resultado |
|---|---|
| Cena de 8 s, 1 vCPU | ≈ 15 s de CPU (≈ 1,9 s de CPU por segundo de vídeo) |
| Mesma cena, preset `medium` (melhor qualidade) | ≈ 50 s de CPU (~3,2×) |
| Concatenar cenas **sem recodificar** (`-c copy`) | 0,5 s |
| Mixar narração + trilha e codificar o áudio | < 1 s para 8–40 s de áudio |

Extrapolação para 2 h (7.200 s): **≈ 3,75 h de CPU** (veryfast) a **≈ 12 h de CPU** (medium).

**Estratégia: renderizar por cena, em paralelo.** 900 cenas de 8 s → N workers → concatenar → mixar áudio
→ enviar ao R2. Com 30 workers de 1 vCPU, ≈ **8 minutos** de relógio (mais partida das máquinas e
transferências). Em uma única máquina de 4 vCPU, ≈ 1 h. Custo de computação por vídeo: **≈ US$ 0,10–0,60**.

Limitações: transições entre cenas (fade cruzado) exigem tratamento extra para manter a concatenação sem
recodificar. A medição é um piso de velocidade (CPU modesta); **vale um benchmark curto no provedor escolhido**
(custa centavos e só será feito com sua aprovação).

Tamanhos por vídeo de 2 h: final 1080p a 6–8 Mbps ≈ **5,4–7,2 GB**; áudio MP3 128 kbps ≈ 115 MB (WAV 24 kHz
mono ≈ 346 MB); ~720 imagens ≈ 0,8 GB.

## 6. Estimativa de custo por vídeo de 2 horas

Premissas: roteiro de 18.000 palavras (~100 mil caracteres); 1 imagem a cada 10 s = 720 imagens, com 30% de
regeração (~936 gerações) + 5 thumbnails; 1 idioma; 1080p30.

| Item | Econômico | Equilibrado | Premium |
|---|---|---|---|
| Roteiro + prompts de cena (LLM) | Haiku 4.5: **1,1** | Sonnet 4.6: **3,3** | Opus 4.8: **5,6** |
| Narração (100 mil car. ≈ 120 min) | Google Standard 0,4 · Speechify 0,6 · Neural2 1,6 | OpenAI mini-tts **1,8** · Chirp 3 HD 3,0 | ElevenLabs v2/v3 **10,0** |
| Imagens (936 + thumbs) | FLUX schnell **3,0** | gpt-image baixa **8,6** · Imagen 4 Fast 18,9 | Imagen 4 padrão 37,6 · Ultra **56,4** |
| Render (computação) | 0,2 | 0,3 | 0,6 |
| Tráfego de saída / extras | ~0,2 | ~0,2 | ~0,2 |
| **Total por vídeo (US$)** | **≈ 5–7** | **≈ 14–26** | **≈ 55–75** |

Traduções: cada idioma extra custa ≈ US$ 0,2–0,5 de LLM, mais a narração e o render dele (um vídeo por idioma).

### Custo mensal (fixo + variável)
Custo fixo estimado da infraestrutura: **US$ 25–65/mês** (Opção A ≈ 25; Opção B ≈ 45–65).

| Vídeos de 2 h por mês | Econômico | Equilibrado | Premium |
|---|---|---|---|
| 10 | US$ 75–135 | US$ 165–325 | US$ 575–815 |
| 30 | US$ 175–275 | US$ 445–845 | US$ 1.675–2.315 |

Armazenamento acumulado (R2): ~8 GB retidos por vídeo, ≈ US$ 0,12/mês por vídeo, crescendo ao longo do
tempo (ex.: 1,4 TB após 6 meses a 30 vídeos/mês ≈ US$ 21/mês). Mitigação: apagar intermediários após o render,
mover finais publicados para B2 ou excluí-los.

**Maior alavanca de custo: o provedor e a qualidade das imagens.** Reduzir a densidade (1 imagem a cada 20 s)
ou usar FLUX schnell corta o custo de imagens em 2×–20×.

## 7. O que muda no projeto (migração das Fases 0 a 3)

O que já existe é preservado. O código foi desenhado com repositórios e armazenamento abstratos (`ChannelsRepository`,
`ScriptsRepository`, `AudiosRepository`, `AudioStorage`, `TtsProvider`, `LlmProvider`), então a migração é de **adaptadores**:

| Hoje | Na nuvem | Esforço |
|---|---|---|
| SQLite embutido do Node | **PostgreSQL**: novos repositórios (`LIKE` → `ILIKE` + `unaccent`, `rowid` → `created_at, id`, migrações com ferramenta própria). Testes e desenvolvimento local com **PGlite** (Postgres em WASM, sem Docker) | médio |
| `LocalAudioStorage` (disco) | `S3AudioStorage` (R2): envio **direto do navegador por URL assinada** (multipart para arquivos grandes), leitura por URL assinada com Range. Elimina a limitação de 10 MB do proxy e o envio via API | médio |
| Sem login (API em 127.0.0.1) | **Autenticação obrigatória** (e-mail/Google com lista de permissão para você; modelo já tem `owner_id` para multiusuário), limite de requisições, CORS por variável de ambiente | médio |
| Pipeline de áudio em memória (`run`) | Vira **handler de job** na fila (pg-boss): lease/heartbeat substitui o "marcar como erro após reinício"; retomada por parte já existe | pequeno |
| Variáveis de ambiente locais | Segredos da plataforma (nunca no repositório nem no navegador); `.env.example` documenta nomes | pequeno |
| `npm run dev` | Mantido para desenvolvimento; adiciona **Dockerfiles** (web, API/worker, render com FFmpeg + fontes) e **CI/CD** (GitHub Actions: testes, typecheck, build, deploy em *staging* e produção) | pequeno |
| Dados de teste do SQLite | Descartáveis; se quiser preservá-los, um script único exporta para o Postgres/R2 | pequeno |

### Fases revisadas
| Fase | Entrega |
|---|---|
| **3.5 Fundação em nuvem** (antes da 4) | Auth, Postgres, R2, fila (pg-boss), Dockerfiles, CI/CD, ambiente de *staging*, **orçamento e confirmação de custos** |
| 4 Imagens | Adaptador de imagens online, geração por cena, thumbnails, galeria e aprovação, arquivos no R2 |
| 5 Fila de produção (interface) | Etapas, progresso, erros, retry, custo por vídeo |
| **6 Workers de render na nuvem** | Substitui o agente local: imagem Docker com FFmpeg, criação/destruição de workers, render por cena em paralelo |
| 7 Editor | Montagem, legendas, trilha, efeitos; pipeline: planejar → cenas em paralelo → concatenar → mixar → R2 |
| 8 YouTube | OAuth no servidor (tokens criptografados), upload resumível **do worker na nuvem** direto do R2, agendamento |

## 8. Orçamento e proteção contra gastos (requisito de produto)

- Cada ação que chama provedor pago mostra **estimativa de custo antes** e exige confirmação.
- Limite mensal por provedor e global; ao atingir, os jobs pausam.
- Custo real registrado por job e somado por vídeo/canal.
- Chaves de API cadastradas só no servidor; trocadas por variável de ambiente.
- Nada é ativado enquanto você não autorizar e não criar as contas/cartão (isso é feito por você).

## 9. Segurança

HTTPS em tudo; sessões seguras; lista de permissão de e-mails; URLs assinadas com expiração curta; validação de
formato por conteúdo (já existe para áudio); limites de tamanho; tokens do YouTube criptografados em repouso;
logs sem segredos; *backups* diários do Postgres; acesso mínimo (IAM) por serviço.

## 10. Riscos e pontos a verificar

1. **YouTube:** projetos de API não auditados podem ter uploads restritos a privados; a auditoria leva semanas.
   Iniciar o processo cedo. Conferir a política atual.
2. **Monetização:** a política do YouTube sobre conteúdo "inautêntico"/repetitivo em massa e a exigência de
   declarar conteúdo sintético realista podem afetar canais 100% automatizados. Pesquisar antes de escalar.
3. **Licenças:** conferir uso comercial de voz e de imagens em cada provedor e plano.
4. **Preços e modelos mudam**: os valores acima vêm de pesquisa em sites agregadores; confirmar no site oficial.
5. **Talkify Labs:** não localizei documentação pública. Sem ela, usar outro TTS ou aguardar o material.
6. **Fim de custo zero:** hoje o desenvolvimento é gratuito; a nuvem tem custo fixo mensal desde o primeiro dia.

## 11. Decisões necessárias

1. Aprovar o requisito 100% online e a remoção do agente local.
2. Escolher a pilha (A enxuta ou B gerenciada) e o provedor de banco.
3. Aprovar a **Fase 3.5** antes da Fase 4.
4. Perfil de qualidade/custo inicial (econômico, equilibrado ou premium) e orçamento mensal máximo.
5. Autorizar (ou não) um benchmark curto de render no provedor escolhido (centavos de custo).
6. Definir quem cria as contas (você) e como passar as chaves (nunca no chat; variáveis de ambiente).
