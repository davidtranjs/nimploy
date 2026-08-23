# Nimploy

Nimploy is a lightweight, low-footprint application deployment engine with embedded SQLite, in-process job queue, Caddy reverse proxy, and pre-compiled React SPA.

## Quick Start

### Development

```bash
# Install dependencies
pnpm install

# Run backend server
pnpm dev:server

# Run frontend client
pnpm dev:client
```

### Production Build

```bash
pnpm build
```

### Tests

```bash
pnpm test
```

### Docker

```bash
docker compose up -d
```
