# RMS public VIEWER predeployment image. Not ready for live release until durable
# snapshots and the private scheduled-updater pipeline have been implemented.
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
CMD ["node", "--import", "tsx", "server.ts"]
