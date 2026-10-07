# Imagem da API e do worker (a mesma imagem; a função é escolhida por ROLE=api|worker|all).
# Construir a partir da RAIZ do repositório:  docker build -f apps/api/Dockerfile -t rrn-api .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace=@rrn/shared --workspace=@rrn/api --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @rrn/shared && npm run build -w @rrn/api

FROM node:22-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 TRUST_PROXY=true
WORKDIR /app
# Dependências só de produção, instaladas do zero (determinístico)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace=@rrn/shared --workspace=@rrn/api --include-workspace-root && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
