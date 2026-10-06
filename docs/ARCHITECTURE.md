# Arquitetura (resumo aprovado)

Pipeline: Canal → Roteiro → Áudio → Imagens/Thumbnail → Montagem → Render → Publicação.

- **web** (Next.js) → **api** (NestJS) → SQLite local (futuro: PostgreSQL via novos repositórios).
- **Fila** (Fase 5): jobs persistidos no banco, com estado, progresso e retry. Redis/BullMQ só se necessário.
- **Agente local Windows** (Fase 6): programa Node que **conecta de saída** à API (WebSocket/TLS), sem abrir portas.
  Pareamento por código de uso único, token revogável, lista fixa de comandos (render/cancelar/status),
  assets por URL temporária assinada, vídeo final mantido no PC.
- **Render** (Fase 7): FFmpeg local. A RTX 3050 6 GB permite NVENC para codificação.
- **Imagens locais**: com 6 GB de VRAM, SDXL exige otimizações; SD 1.5 roda com folga. A avaliar na Fase 4.
- **Segredos**: somente no servidor; nunca no frontend.
- **Provedores**: interfaces em `packages/shared/src/providers.ts`; cada integração é um adaptador novo.

Fases: 0-1 base e canais (feito) · 2 roteiros (feito) · 3 áudio · 4 imagens · 5 fila · 6 agente · 7 editor/render · 8 YouTube.
