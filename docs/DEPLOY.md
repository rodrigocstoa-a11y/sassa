# Como o RRN Studio AI fica online (guia de implantação)

> **Estado:** nada foi contratado, ativado ou cobrado. Este guia explica o que acontece quando **você**
> decidir publicar, quanto custa cada peça e em que momento a cobrança começa. Eu não crio contas,
> não uso cartão e não ativo serviços pagos sem sua autorização expressa.

## 1. O que roda onde (pilha A, enxuta)

```
Navegador ──HTTPS──▶ Site (Next.js)  ── rede privada ──▶ API (NestJS)  ─▶ PostgreSQL
      │                  │  /api/* repassado em runtime         │
      │                  └──────────────────────────────────────┤
      └─── envio/leitura direta por URL assinada ───▶ Cloudflare R2 (S3)  ◀── Worker (mesma imagem da API, ROLE=worker)
```

| Peça | Serviço sugerido | Função |
|---|---|---|
| Site | Railway (imagem `apps/web/Dockerfile`) | Único componente com endereço público |
| API | Railway (imagem `apps/api/Dockerfile`, `ROLE=api`) | Regras, login, orçamento. Pode ficar **sem endereço público** |
| Worker | Railway (mesma imagem, `ROLE=worker`) | Executa a fila (narração, e depois imagens/YouTube) |
| Banco | PostgreSQL do Railway | Dados + fila |
| Arquivos | Cloudflare R2 | Áudios, imagens e vídeos; saída de dados grátis |
| Render FFmpeg | Fly.io Machines efêmeras (Fase 6) | Ainda não implementado |

Seu computador só abre o site. Nenhuma função depende dele.

## 2. Custos ANTES de ativar (estimativas; confirme nos sites oficiais)

| Item | Quando começa a cobrar | Valor de referência |
|---|---|---|
| Railway | Ao criar o projeto e escolher um plano | Hobby US$ 5/mês ou Pro US$ 20/mês (inclui o mesmo valor em uso); acima disso, cobrança por uso: US$ 20/vCPU·mês, US$ 10/GB RAM·mês, US$ 0,15/GB·mês de volume |
| Uso estimado (site + API + worker + Postgres pequenos) | Contínuo | ≈ US$ 15–25/mês |
| Cloudflare R2 | Após 10 GB armazenados | US$ 0,015/GB·mês; saída grátis. *Pode exigir cartão no cadastro, mesmo no uso gratuito: confirmar* |
| Domínio próprio (opcional) | Na compra | Varia, ordem de US$ 10–20/ano (não pesquisado) |
| **Total fixo estimado** | | **≈ US$ 25–30/mês** |
| Narração, imagens e texto por IA | **Só quando você conectar um provedor, definir orçamento e confirmar cada ação** | Ver `CLOUD_ARCHITECTURE.md` (≈ US$ 5–75 por vídeo de 2 h conforme o perfil) |
| Render de vídeo (Fase 6) | Só ao usar | ≈ US$ 0,10–0,60 por vídeo de 2 h |

**Proteções já implementadas:** sem orçamento mensal definido, nenhuma ação paga roda (limite padrão US$ 0);
cada ação mostra a estimativa e exige sua confirmação; o servidor para ao atingir o limite; o custo é
registrado por ação. Recomendo também configurar **alertas de gasto e limite de uso nos próprios painéis** (Railway, R2).

## 3. Passo a passo (feito por você; cerca de 1 hora)

1. **Cloudflare R2:** crie a conta, um bucket **privado** chamado `rrn-studio` e um token de API com
   permissão de leitura/escrita **somente nesse bucket**. Anote `Account ID`, `Access Key ID` e `Secret`.
   Configure o **CORS** do bucket (permite o navegador enviar o arquivo direto):
   ```json
   [{ "AllowedOrigins": ["https://SEU-SITE"], "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["content-type", "range"], "ExposeHeaders": ["ETag", "Content-Range"], "MaxAgeSeconds": 3600 }]
   ```
2. **Railway:** crie um projeto, adicione **PostgreSQL** e três serviços a partir do repositório GitHub:
   - `web`: Dockerfile `apps/web/Dockerfile`, domínio público.
   - `api`: Dockerfile `apps/api/Dockerfile`.
   - `worker`: Dockerfile `apps/api/Dockerfile` (mesma imagem).
3. **Variáveis** (use os campos de segredo da plataforma; **nunca** coloque no Git ou no chat):

   | Serviço | Variável | Valor |
   |---|---|---|
   | api e worker | `NODE_ENV` | `production` |
   | api e worker | `DATABASE_URL` | URL do PostgreSQL do Railway |
   | api e worker | `APP_SECRET` | texto aleatório de 32+ caracteres |
   | api e worker | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seu e-mail e uma senha forte (12+ caracteres) |
   | api e worker | `STORAGE_DRIVER` | `s3` |
   | api e worker | `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | api e worker | `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | do passo 1 |
   | api | `ROLE` | `api` |
   | worker | `ROLE` | `worker` |
   | api | `WEB_ORIGINS` | `https://SEU-SITE` (a origem pública do site) |
   | api | `TRUST_PROXY` | `true` (já é o padrão da imagem) |
   | web | `API_URL` | endereço **interno** da API, ex.: `http://api.railway.internal:3001` |

4. Faça o primeiro deploy como **ambiente de teste** (staging), abra o site, entre com `ADMIN_EMAIL`,
   defina o orçamento em *Configurações* e importe um áudio para validar o fluxo com o R2 real.
5. Só depois, se quiser, aponte um domínio próprio.

## 4. O que ainda NÃO foi validado (seja prudente no primeiro deploy)

- As **imagens Docker não foram construídas** (o ambiente de desenvolvimento não tem Docker). Os passos
  que elas executam foram reproduzidos manualmente (instalação só de produção, build, execução da API e
  do site em modo `standalone`), mas o primeiro `docker build` real pode revelar ajustes.
- O driver S3 foi testado contra um **S3 falso** (envio, leitura com Range, listagem, exclusão, URLs
  assinadas). A **assinatura real e o CORS do R2** só se confirmam no primeiro teste com o bucket verdadeiro.
- Railway e R2 **não foram testados**. O `docker-compose.yml` (PostgreSQL + MinIO + API + worker + site) é a
  forma de ensaiar a nuvem no seu PC com Docker Desktop, mas também não foi executado aqui.
- Backups: ative os backups automáticos do PostgreSQL no provedor e teste a restauração.

## 5. Operação

- **Logs:** painel do Railway. A API registra falhas de jobs sem expor segredos.
- **Escala:** o worker pode ter várias réplicas (a fila usa `FOR UPDATE SKIP LOCKED`, testada com Postgres real).
- **Reinícios:** jobs interrompidos são retomados automaticamente (lease + tentativas com espera crescente).
- **Trocar a senha do administrador:** altere `ADMIN_PASSWORD` e reinicie; as sessões antigas são encerradas.
- **Desligar tudo:** pausar/excluir o projeto no Railway encerra a cobrança de computação; o R2 cobra só o armazenado.
