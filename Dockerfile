FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY supabase ./supabase
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @agent-comms/web build

ENV NODE_ENV=production
ENV HUB_BACKEND=pglite
ENV HUB_DATA_DIR=/data/hub
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000
VOLUME ["/data"]

CMD ["pnpm", "--filter", "@agent-comms/web", "start"]
