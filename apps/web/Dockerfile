# Imagem do site (Next.js). Construir a partir da RAIZ:  docker build -f apps/web/Dockerfile -t rrn-web .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@rrn/shared --workspace=@rrn/web --include-workspace-root
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @rrn/shared
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @rrn/web

FROM node:22-slim
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3000
# API_URL (ex.: http://api.internal:3001) é lida em tempo de execução pelo proxy /api.
CMD ["node", "apps/web/server.js"]
