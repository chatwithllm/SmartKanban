# syntax=docker/dockerfile:1.6
FROM node:22-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm install
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server-build
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm install
COPY server/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev \
  && apt-get purge -y python3 make g++ && apt-get autoremove -y
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/schema.sql ./schema.sql
COPY --from=web-build /app/web/dist /app/web/dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
