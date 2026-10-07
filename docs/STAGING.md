# Guia do ambiente de teste (staging), passo a passo

**Objetivo:** colocar o RRN Studio AI na internet em um endereço de teste, para você abrir no navegador, entrar com
login e conferir o painel. **Etapa 1** usa apenas o Railway (site + API + banco). O armazenamento R2 e o worker
separado ficam para a Etapa 2, depois que você aprovar a Etapa 1.

> **Regra de ouro:** nenhum passo de cobrança acontece antes da sua aprovação. A seção 2 mostra o custo total e
> termina em uma **PARADA**: só continue para a seção 3 depois de me dizer "aprovo".
>
> Os painéis (Railway, Cloudflare) mudam de aparência com frequência. Se um botão tiver outro nome ou lugar,
> **me mande uma captura de tela** (cuidado para não mostrar senhas, tokens ou chaves) e eu ajusto o passo.

---

## 1. O que vai existir ao final da Etapa 1

```
Você (navegador) ──HTTPS──▶  web  (site)  ──rede privada──▶  api (API + worker no mesmo serviço)  ──▶  Postgres
                          endereço público                     sem endereço público
                          xxxx.up.railway.app
```

- **3 serviços** no Railway: `Postgres` (banco), `api` (API; também processa a fila com `ROLE=all`) e `web` (site).
- Só o `web` tem endereço público. O endereço `*.up.railway.app` é **grátis** (não precisa comprar domínio).
- Login obrigatório. Sem orçamento definido, **nenhuma ação paga de IA roda** (e nenhum provedor está conectado).
- Arquivos (áudios): **ainda não** vão para a nuvem nesta etapa. Importar áudio só será testado na Etapa 2 (com o R2).
  Nesta etapa você confere: login, painel, canais, roteiros, configurações e orçamento.

---

## 2. Custo total estimado (leia antes de qualquer cadastro)

Valores de referência pesquisados em outubro/2026 em sites de preços; **confirme na tela de planos do Railway antes de pagar**.

| Item | Custo | Quando começa |
|---|---|---|
| Conta Railway, plano **Trial** | US$ 0, com **crédito único de US$ 5** | Ao criar a conta (as fontes divergem se pede cartão) |
| Uso dos 3 serviços (≈ 0,5 GB de memória no total + CPU quase ociosa) | **≈ US$ 0,20 a 0,35 por dia** | Enquanto os serviços estiverem ligados |
| Plano **Hobby** (necessário quando o crédito do Trial acabar ou para uso contínuo) | **US$ 5/mês**, que já inclui US$ 5 de uso; o que passar disso é cobrado à parte | Só se você assinar |
| Domínio próprio | **US$ 0** (usamos o endereço grátis do Railway) | Não será comprado |
| Cloudflare R2 (arquivos) | **US$ 0 nesta etapa** (fica para a Etapa 2; exige forma de pagamento no cadastro, mesmo no plano grátis) | Não será ativado |
| IA (roteiro, voz, imagem) | **US$ 0** (nenhum provedor conectado; orçamento mensal padrão = US$ 0) | Não será ativado |

**Resumo:**
- **Testar por 1 a 2 semanas:** cabe no crédito do Trial, ou seja, **≈ US$ 0**, se o Railway não pedir cartão ou se você o cadastrar mas não passar do crédito.
- **Deixar ligado o mês inteiro:** **≈ US$ 6 a 10/mês** (Hobby: o maior valor entre US$ 5 e o uso real).
- **Teto desta etapa:** até **US$ 10/mês**. Você pode **excluir o projeto a qualquer momento** e a cobrança de computação para.

Proteção recomendada (no painel do Railway, em *Billing / Usage*): procure a opção de **limite de gasto** ou **alerta de uso**
e defina um teto de US$ 10. Eu não consigo configurar isso por você.

> ## ⛔ PARADA: aprovação de custo
> Responda aqui com: **"aprovo a Etapa 1 (até US$ 10/mês)"**, ou diga o que prefere mudar.
> Enquanto eu não receber essa frase, **não crie conta paga, não informe cartão e não assine nenhum plano.**
> (Os passos da seção 3 abaixo são gratuitos e você já pode fazê-los.)

---

## 3. Preparação gratuita (pode fazer agora)

### 3.1 Confirme o código no GitHub
1. Abra https://github.com/rodrigocstoa-a11y/sassa
2. Clique no seletor de branch (canto superior esquerdo, escrito `main` ou o nome da branch) e escolha
   `claude/rrn-studio-ai-video-platform-pm3c4h`. Confirme que existem as pastas `apps`, `packages` e `docs`.
   *(O Railway vai publicar a partir desta branch.)*

### 3.2 Gere os segredos (no seu PC, sem internet)
No PowerShell, dentro da pasta do projeto (`cd sassa`), atualize e rode:
```powershell
git pull
node scripts/gen-secrets.mjs
```
Ele mostra duas linhas: `APP_SECRET=...` e `ADMIN_PASSWORD=...`. **Copie-as para um gerenciador de senhas ou um bloco de notas
seguro.** Elas não são salvas em lugar nenhum. **Nunca as cole em chats (inclusive aqui), e-mails ou no Git.**

*Alternativa sem Node (Windows PowerShell):*
```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```
(use o resultado como `APP_SECRET`; para a senha, escolha uma frase longa com 12+ caracteres).

Anote também o **e-mail** que você quer usar para entrar (será o `ADMIN_EMAIL`).

---

## 4. Railway (só depois da sua aprovação na seção 2)

### 4.1 Criar a conta
1. Acesse https://railway.com e clique em **Login** (canto superior direito) → **Login with GitHub**. Autorize.
2. Você começa no plano **Trial**. Se pedirem cartão ou verificação, **pare e me avise antes de informar dados de pagamento.**

### 4.2 Criar o projeto e o banco
1. No painel, clique em **New Project**.
2. Escolha **Deploy PostgreSQL** (ou **Empty Project** e depois **+ Create → Database → Add PostgreSQL**).
3. O serviço do banco aparece como um cartão. Anote o nome dele (normalmente **Postgres**): ele será usado em `${{Postgres.DATABASE_URL}}`.

### 4.3 Criar o serviço `api`
1. No canvas do projeto, clique em **+ Create** (ou **New**) → **GitHub Repo**.
2. Se for a primeira vez, clique em **Configure GitHub App** e dê acesso ao repositório `rodrigocstoa-a11y/sassa`. Selecione-o.
3. Clique no cartão novo → aba **Settings**:
   - Nome do serviço (topo): troque para `api`.
   - **Source → Branch:** `claude/rrn-studio-ai-video-platform-pm3c4h`.
   - **Root Directory:** **deixe vazio** (o Dockerfile precisa enxergar o repositório inteiro).
   - **Networking:** **não** clique em *Generate Domain* (a API fica privada).
   - **Deploy → Healthcheck Path:** `/api/health`.
4. Aba **Variables → Raw Editor** e cole o bloco abaixo, **trocando os valores entre `<>`**:
   ```
   RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
   NODE_ENV=production
   ROLE=all
   HOST=::
   PORT=3001
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_SECRET=<o APP_SECRET gerado no passo 3.2>
   ADMIN_EMAIL=<seu e-mail>
   ADMIN_PASSWORD=<a senha gerada ou escolhida>
   STORAGE_DRIVER=local
   TRUST_PROXY=true
   ```
   Clique em **Update Variables**. *(O Railway pode oferecer "Deploy" automaticamente; ainda falta uma variável, `WEB_ORIGINS`, no passo 4.5. É normal o primeiro deploy funcionar sem ela.)*
5. Aba **Deployments**: acompanhe o build (**View logs**). Deve terminar com a linha
   `RRN Studio AI API em http://[::]:3001/api`. O build leva alguns minutos.

### 4.4 Criar o serviço `web`
1. **+ Create → GitHub Repo →** o mesmo repositório.
2. **Settings:** nome `web`; **Branch** igual à anterior; **Root Directory** vazio.
3. **Variables → Raw Editor:**
   ```
   RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
   PORT=3000
   API_URL=http://api.railway.internal:3001
   ```
4. **Settings → Networking → Generate Domain.** Se perguntar a porta, informe **3000**. Copie o endereço gerado
   (algo como `https://web-production-xxxx.up.railway.app`).
5. Acompanhe o build em **Deployments**.

### 4.5 Informar o endereço do site à API (obrigatório para o login funcionar)
1. Abra o serviço `api` → **Variables** e adicione:
   ```
   WEB_ORIGINS=https://web-production-xxxx.up.railway.app
   ```
   (o endereço exato copiado no passo 4.4, **sem barra no final**).
2. Aguarde o novo deploy da `api` terminar.

---

## 5. Verifique no navegador (checklist)

Abra o endereço do site. Marque cada item:

- [ ] Aparece a tela **"RRN Studio AI, Entre para acessar o painel"** (e não o painel direto).
- [ ] Senha errada mostra "E-mail ou senha incorretos".
- [ ] Com `ADMIN_EMAIL` e `ADMIN_PASSWORD` você entra e vê o **Dashboard** (com seu e-mail e o botão **Sair** no canto inferior esquerdo).
- [ ] **Canais:** criar, editar e excluir um canal de teste.
- [ ] **Roteiros:** criar um roteiro, salvar (Ctrl+S) e pesquisar.
- [ ] **Configurações:** mostra **PostgreSQL**, **Disco local** e **Login: Obrigatório**; o orçamento aparece como **Não definido**.
- [ ] **Sair** volta ao login; abrir `/canais` sem login redireciona ao login.
- [ ] Atualize a página (F5): continua logado.

> Observação: nesta etapa o armazenamento é "Disco local" e **não persiste** entre deploys. Não é para guardar áudios
> ainda; isso se resolve na Etapa 2 (R2).

## 6. Se algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Build do `web` ou `api` falha logo no início | Caminho do Dockerfile errado ou *Root Directory* preenchido | Confirme `RAILWAY_DOCKERFILE_PATH` e que *Root Directory* está **vazio**; abra **View logs** e me envie as últimas ~30 linhas |
| O site abre mas diz **"A API está indisponível"** ou fica em "Carregando…" | O `web` não alcança a `api` | Confirme `API_URL=http://api.railway.internal:3001`, `PORT=3001` e `HOST=::` na `api`, e que o nome do serviço é exatamente `api` |
| Login responde **"Origem não autorizada"** | `WEB_ORIGINS` diferente do endereço real do site | Corrija (https, sem barra final) e aguarde o redeploy |
| Login funciona mas volta ao login a cada página | Cookie não gravado | Use o endereço **https** do Railway (não http) e limpe os cookies do site |
| `api` reinicia sem parar | Falta `APP_SECRET`, `ADMIN_EMAIL` ou `ADMIN_PASSWORD` (a API recusa subir sem eles) | Veja a mensagem nos logs e complete as variáveis |
| Erro de banco / "connection refused" | `DATABASE_URL` não aponta para o serviço do banco | O nome na referência deve ser igual ao do cartão do banco: `${{NomeDoBanco.DATABASE_URL}}` |

Para enviar logs: **copie o texto**, **apague** qualquer valor secreto (senhas, tokens, `DATABASE_URL`) e cole aqui.

## 7. Quando terminar de testar, ou para parar a cobrança
- Pausar: em cada serviço, **Settings → Danger** (remover o deployment) ou, para encerrar tudo, **Project → Settings → Delete Project**.
  Como a cobrança é por uso, desligar para o gasto de computação.
- Me avise o resultado do checklist. **Só então** seguimos para: (a) Etapa 2 (R2 + worker separado, com novo orçamento a aprovar) e
  (b) a implementação de geração de imagens e renderização de vídeo na nuvem.
