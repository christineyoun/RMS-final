# RMS public viewer / private job image. Readiness requires a seeded persistent
# publication bucket; no local runtime data or credentials are baked into it.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    RMS_PUBLIC_READONLY=1 \
    RMS_DISABLE_SCHEDULERS=1
COPY --from=build /app /app
# Intentionally omit RMS_PUBLIC_DATA_READY. Startup refuses an unverified launch.
CMD ["node", "--import", "tsx", "scripts/cloud/start.ts"]
