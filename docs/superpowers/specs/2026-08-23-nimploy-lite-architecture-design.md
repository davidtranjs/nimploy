# Nimploy Lite: Ultra-Low Footprint Architecture Specification

**Date**: 2026-08-23  
**Status**: Approved  
**Target Footprint**: < 70MB Idle RAM | < 0.1% Idle CPU  
**Target Environments**: Ultra-budget VPS (512MB–1GB RAM), Raspberry Pi, Edge devices

---

## 1. Overview & Problem Statement

Standard Dokploy relies on a multi-container architecture composed of:
1. **Next.js SSR + Custom Node.js Server**: ~150–250MB RAM
2. **PostgreSQL 16/18 Container (`dokploy-postgres`)**: ~60–120MB RAM
3. **Redis / BullMQ / Inngest**: ~25–40MB RAM
4. **Traefik v3 (`dokploy-traefik`)**: ~35–60MB RAM
5. **Continuous Telemetry / Background Monitoring**: ~25MB RAM + periodic CPU wakeups

**Total Idle Footprint**: ~300MB–500MB RAM. On a 512MB or 1GB VPS, this leaves little to no headroom for user-deployed applications and frequently triggers OOM kills during builds.

**Nimploy Lite** revamps the architecture by consolidating the control plane into a single lightweight Node.js/Bun process with an embedded SQLite database, in-process task queue, pre-compiled Vite React SPA, and Caddy reverse proxy.

---

## 2. Architecture & Topology

```
+-------------------------------------------------------------------------------+
|                                   Host VPS                                    |
|                                                                               |
|   +--------------------------+  :80/:443  +-------------------------------+   |
|   |       Caddy Proxy        | ---------> |      Nimploy Control Plane    |   |
|   | (Auto TLS / Let'sEncrypt)|            |        (Single Process)       |   |
|   |      (~15-20MB RAM)      |            |         (~35-50MB RAM)        |   |
|   +-------------+------------+            +---------------+---------------+   |
|                 | (Routes traffic)                        | (Orchestrates)    |
|                 v                                         v                   |
|   +--------------------------+            +-------------------------------+   |
|   | User Deployed Apps       |            | Embedded SQLite (/etc/data.db)|   |
|   | (Docker Compose / Stacks)|            | Docker Engine (/var/run/sock) |   |
|   +--------------------------+            +-------------------------------+   |
+-------------------------------------------------------------------------------+
```

### Component Comparison Table

| Component | Standard Dokploy | Nimploy Lite | RAM Savings |
| :--- | :--- | :--- | :--- |
| **Control Plane Server** | Next.js SSR + Node HTTP Server | Single Hono HTTP + WebSocket Server | ~150MB -> ~40MB |
| **Database** | PostgreSQL Container (`dokploy-postgres`) | Embedded SQLite (`better-sqlite3` in WAL) | ~80MB -> 0MB (In-process) |
| **Task Queue** | Redis + BullMQ / Inngest | In-process SQLite-backed async queue | ~35MB -> 0MB (In-process) |
| **Reverse Proxy** | Traefik v3 | Caddy (or slim Traefik) | ~45MB -> ~15-20MB |
| **Frontend Rendering** | Next.js Server-Side Rendering (SSR) | Pre-compiled static Vite + React SPA | 0% Server CPU / RAM |
| **Metrics Collector** | Background telemetry / Prometheus | On-demand WebSocket streaming | ~25MB -> 0MB idle |
| **Total Idle Footprint** | **~350MB – 500MB** | **~50MB – 70MB** | **~85% Reduction** |

---

## 3. Scope: Retained vs. Pruned Features

### Retained Core Features
* **Docker Compose Deployments**: Full multi-service compose stacks with environment variables and persistent volume definitions.
* **Dockerfile Deployments**: Custom Git repositories with Dockerfiles.
* **Git Integration & Webhooks**: Automatic push-to-deploy for GitHub, GitLab, Gitea, Bitbucket, and generic webhooks.
* **Automatic SSL / Custom Domains**: Zero-config HTTPS with Let's Encrypt / ZeroSSL via Caddy.
* **Live Streaming Logs**: Real-time deployment and container stdout/stderr over WebSockets.
* **Project & Environment Management**: Organizing applications into projects and isolated environments.
* **Server Maintenance**: Git SSH key management, Docker system prune, and basic server settings.

### Pruned Features (Cut to Minimize Footprint)
* **Dedicated Database Provisioning Wizards**: Removed standalone Postgres/MySQL/Mongo/Redis management tabs. Users deploy databases as standard Docker Compose services.
* **AI Copilots & Assistants**: Removed `@ai-sdk/openai`, `@ai-sdk/anthropic`, and related AI packages.
* **Enterprise Modules**: Removed SSO, SCIM, Stripe billing, and whitelabeling.
* **Multi-Server / Swarm Clustering**: Focused strictly on single-host Docker deployments.
* **Heavy Buildpacks**: Removed Paketo, Heroku, and Railpack dependencies.

---

## 4. Detailed Component Design

### 4.1 Backend Engine: Hono + WebSockets
* **Framework**: [Hono](https://hono.dev/) on Node.js/Bun runtime.
* **Roles**:
  * API endpoints for CRUD operations and webhook ingestion.
  * Static file server for the pre-built React Vite SPA (`/dist`).
  * WebSocket handler for real-time deployment progress, container logs (`docker logs -f`), and interactive terminal sessions.

### 4.2 Database: Embedded SQLite via Drizzle ORM
* **Driver**: `better-sqlite3` with Write-Ahead Logging (`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`).
* **Schemas**: Converted from PostgreSQL dialect to SQLite dialect (`sqliteTable`).
* **Core Tables**:
  * `users`, `sessions`
  * `projects`, `environments`
  * `applications` (Git metadata, build configs, environment variables)
  * `deployments` (Execution status, commit hash, build timestamps)
  * `domains` (Domain hostnames, target container ports, HTTPS status)
  * `ssh_keys`, `git_providers`, `server_settings`
  * `jobs` (Persistent deployment queue tasks)

### 4.3 In-Process Deployment Queue
* **Queue Engine**: `p-queue` backed by SQLite `jobs` table.
* **Concurrency**: Limited to 1 concurrent build by default to protect low-RAM hosts from CPU/OOM starvation during builds.
* **Persistence**: State machine (`PENDING` -> `RUNNING` -> `COMPLETED` / `FAILED` / `INTERRUPTED`).
* **Log Handling**: Build outputs stream live to WebSocket clients and write directly to disk (`/etc/nimploy/apps/<appId>/deployments/<id>.log`) without consuming heap memory.

### 4.4 Reverse Proxy: Caddy Integration
* **Proxy Engine**: Caddy v2.
* **Dynamic Reloading**: Nimploy updates Caddy configuration via Caddy's admin API (`http://localhost:2019/load`) or atomic `caddy reload`.
* **Network Isolation**: Applications attach to a bridge network (`nimploy-network`), allowing Caddy to route by internal container name and port without exposing host ports.

### 4.5 Frontend: Vite + React SPA
* **Bundler**: Vite with React plugin.
* **UI Components**: Retains Dokploy's existing Shadcn UI (Radix primitives, Tailwind CSS, Lucide icons, Dark/Light mode).
* **Code Editor**: CodeMirror for YAML and environment variable editing.
* **Data Layer**: `@tanstack/react-query` communicating with Hono REST/RPC endpoints.

---

## 5. Directory & Storage Layout

```
/etc/nimploy/
├── nimploy.db               # SQLite database (all configuration & metadata)
├── nimploy.db-wal           # SQLite Write-Ahead Log
├── caddy/
│   ├── Caddyfile            # Generated Caddy reverse proxy configuration
│   └── data/                # Automatic SSL certificates (ACME)
└── apps/
    └── <app-id>/
        ├── repo/            # Cloned Git repository
        ├── docker-compose.yml
        └── deployments/
            └── <deploy-id>.log
```

---

## 6. Implementation Roadmap

### Phase 1: Core Engine & SQLite Migration
* Configure Drizzle ORM with `better-sqlite3` and define SQLite schemas.
* Build Hono server instance with authentication and basic project/app CRUD APIs.
* Implement the SQLite-backed in-process deployment queue.

### Phase 2: Build Pipeline & Caddy Proxy
* Implement Dockerfile and Docker Compose execution runners with streaming logs.
* Implement Caddy configuration generator and reload mechanism.
* Implement WebSocket endpoints for live deployment logs and container logs.

### Phase 3: Frontend SPA Migration
* Scaffold Vite React SPA and migrate Dokploy UI components.
* Connect React-Query client to Hono endpoints.
* Bundle frontend assets into Hono static file distribution.

### Phase 4: Packaging & Verification
* Create minimal multi-stage Dockerfile based on Node/Alpine + Caddy.
* Benchmark idle memory (<70MB) and build execution under resource constraints.
