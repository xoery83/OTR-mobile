FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY backend ./backend
COPY src/data/api ./src/data/api
COPY src/domain/ledger ./src/domain/ledger
RUN npm run backend:build

FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 --create-home otr

COPY --from=build --chown=otr:otr /app/dist/server.mjs ./server.mjs

USER otr
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.mjs"]
