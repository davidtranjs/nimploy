# Multi-stage build for ultra-small container footprint
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ git
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/client/package.json ./apps/client/
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile || pnpm install

COPY apps/client ./apps/client
COPY apps/server ./apps/server
RUN pnpm --filter=@nimploy/client run build
RUN pnpm --filter=@nimploy/server run build
RUN pnpm --filter=@nimploy/server --prod deploy --legacy /prod/nimploy

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Docker CLI and Caddy
RUN apk add --no-cache docker-cli docker-cli-compose caddy tini

COPY --from=builder /prod/nimploy/package.json ./package.json
COPY --from=builder /prod/nimploy/node_modules ./node_modules
COPY --from=builder /app/apps/client/dist ./client/dist
COPY --from=builder /app/apps/server/dist ./server/dist

VOLUME ["/etc/nimploy", "/var/run/docker.sock"]
EXPOSE 3000 80 443

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/dist/index.js"]
