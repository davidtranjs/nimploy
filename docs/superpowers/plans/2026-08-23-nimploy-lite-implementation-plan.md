# Nimploy Lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp Dokploy into "Nimploy Lite" — an ultra-lightweight single-process PaaS control plane consuming < 70MB idle RAM and < 0.1% idle CPU using embedded SQLite (Drizzle ORM), Hono HTTP + WebSockets, in-process task queue, Caddy reverse proxy, and a pre-compiled Vite React SPA.

**Architecture:** A unified TypeScript server (`apps/lite/server`) running on Node.js/Bun with embedded SQLite (`better-sqlite3`) handling API routes, WebSockets for streaming logs, in-process FIFO job execution, and serving the static SPA (`apps/lite/client`). Caddy is orchestrated via dynamic config reloading for automated Let's Encrypt TLS and reverse proxying.

**Tech Stack:**
- **Runtime & Server**: Node.js / Bun, Hono (`hono`, `@hono/node-server`, `@hono/zod-validator`), `ws` (WebSockets)
- **Database & Queue**: SQLite (`better-sqlite3` in WAL mode), Drizzle ORM (`drizzle-orm`, `drizzle-kit`), `p-queue`
- **Frontend**: Vite, React 19, Tailwind CSS, Shadcn UI / Radix primitives, Lucide React, CodeMirror, `@tanstack/react-query`
- **Container & Proxy Orchestration**: Dockerode, Docker Compose CLI v2, Caddy v2

## Global Constraints
- Target idle RAM footprint: strictly < 70MB RSS for the combined control plane and proxy.
- Target idle CPU: < 0.1% (zero background telemetry daemons, metrics stream only on-demand).
- Zero external dependencies: No PostgreSQL container, no Redis container, no BullMQ/Inngest.
- Retain core deployment workflows: Dockerfile builds, Docker Compose stacks, Git webhooks, dynamic domains, SSL certs, live logs.
- Auto-commit is disabled per user rule (do not commit automatically; ask user confirmation for commits).

---

### Task 1: Initialize `apps/lite` Monorepo Workspace & SQLite Drizzle Schema

**Files:**
- Create: `apps/lite/package.json`
- Create: `apps/lite/tsconfig.json`
- Create: `apps/lite/server/src/db/schema.ts`
- Create: `apps/lite/server/src/db/index.ts`
- Create: `apps/lite/server/src/db/drizzle.config.ts`
- Test: `apps/lite/server/__test__/db.test.ts`

**Interfaces:**
- Consumes: `better-sqlite3`, `drizzle-orm/better-sqlite3`
- Produces: `db`, SQLite tables (`users`, `sessions`, `projects`, `environments`, `applications`, `deployments`, `domains`, `sshKeys`, `jobs`, `settings`)

- [ ] **Step 1: Create `apps/lite` workspace package configuration**

```json
{
  "name": "@nimploy/lite",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "tsx watch server/src/index.ts",
    "dev:client": "vite client",
    "build:server": "tsc -p server/tsconfig.json",
    "build:client": "vite build client",
    "build": "pnpm build:client && pnpm build:server",
    "test": "vitest run --dir server/__test__",
    "db:generate": "drizzle-kit generate --config server/src/db/drizzle.config.ts",
    "db:migrate": "tsx server/src/db/migrate.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.14.3",
    "@hono/zod-validator": "^0.7.6",
    "@tanstack/react-query": "^5.90.21",
    "better-sqlite3": "^11.8.1",
    "clsx": "^2.1.1",
    "dockerode": "^4.0.2",
    "dotenv": "^16.4.5",
    "drizzle-orm": "^0.45.2",
    "hono": "^4.11.7",
    "lucide-react": "^0.469.0",
    "nanoid": "^5.0.9",
    "p-queue": "^8.0.1",
    "tailwind-merge": "^2.6.1",
    "ws": "^8.18.0",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/dockerode": "^3.3.34",
    "@types/node": "^24.4.0",
    "@types/ws": "^8.5.14",
    "@vitejs/plugin-react": "^4.3.4",
    "drizzle-kit": "^0.31.4",
    "tsx": "^4.22.4",
    "typescript": "^5.7.3",
    "vite": "^6.2.0",
    "vitest": "^3.0.7"
  }
}
```

- [ ] **Step 2: Write failing unit test for SQLite Drizzle schema and migrations**

Create `apps/lite/server/__test__/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";

describe("SQLite Database & Schema", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    db = drizzle(sqlite, { schema });

    // Initialize tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        app_type TEXT NOT NULL, -- 'dockerfile' | 'compose' | 'image'
        repository_url TEXT,
        branch TEXT DEFAULT 'main',
        dockerfile_path TEXT DEFAULT 'Dockerfile',
        compose_path TEXT DEFAULT 'docker-compose.yml',
        docker_image TEXT,
        env_vars TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        status TEXT NOT NULL, -- 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED'
        commit_hash TEXT,
        log_path TEXT,
        started_at INTEGER,
        finished_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS domains (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        host TEXT NOT NULL UNIQUE,
        container_port INTEGER NOT NULL,
        https_enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  });

  it("should create and retrieve a project with applications and domains", async () => {
    const projectId = "proj-1";
    await db.insert(schema.projects).values({
      id: projectId,
      name: "Demo Project",
      description: "Testing SQLite Schema",
      createdAt: Date.now(),
    });

    const appId = "app-1";
    await db.insert(schema.applications).values({
      id: appId,
      projectId,
      name: "Web API",
      appType: "dockerfile",
      repositoryUrl: "https://github.com/example/api.git",
      branch: "main",
      createdAt: Date.now(),
    });

    await db.insert(schema.domains).values({
      id: "dom-1",
      applicationId: appId,
      host: "api.example.com",
      containerPort: 3000,
      httpsEnabled: 1,
      createdAt: Date.now(),
    });

    const [savedApp] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, appId));

    expect(savedApp).toBeDefined();
    expect(savedApp.name).toBe("Web API");
    expect(savedApp.appType).toBe("dockerfile");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter=@nimploy/lite test`
Expected: FAIL (schema modules do not exist yet)

- [ ] **Step 4: Implement `schema.ts`, `index.ts`, and `drizzle.config.ts`**

Create `apps/lite/server/src/db/schema.ts`:
```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at").notNull(),
});

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  appType: text("app_type").notNull(), // 'dockerfile' | 'compose' | 'image'
  repositoryUrl: text("repository_url"),
  branch: text("branch").default("main"),
  dockerfilePath: text("dockerfile_path").default("Dockerfile"),
  composePath: text("compose_path").default("docker-compose.yml"),
  dockerImage: text("docker_image"),
  envVars: text("env_vars").default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED'
  commitHash: text("commit_hash"),
  logPath: text("log_path"),
  startedAt: integer("started_at"),
  finishedAt: integer("finished_at"),
});

export const domains = sqliteTable("domains", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  host: text("host").notNull().unique(),
  containerPort: integer("container_port").notNull(),
  httpsEnabled: integer("https_enabled").default(1),
  createdAt: integer("created_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull(),
  jobType: text("job_type").notNull(), // 'deploy' | 'rebuild' | 'cleanup'
  status: text("status").notNull(), // 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

Create `apps/lite/server/src/db/index.ts`:
```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";

const DB_DIR = process.env.DATA_DIR || "/etc/nimploy";
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(DB_DIR, "nimploy.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });
export { sqlite, schema };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter=@nimploy/lite test`
Expected: PASS

---

### Task 2: In-Process Deployment Queue & SQLite State Machine

**Files:**
- Create: `apps/lite/server/src/queue/jobQueue.ts`
- Test: `apps/lite/server/__test__/jobQueue.test.ts`

**Interfaces:**
- Consumes: `p-queue`, `apps/lite/server/src/db/index.ts`
- Produces: `JobQueue.addJob()`, `JobQueue.recoverInterruptedJobs()`, `JobQueue.onStatusChange()`

- [ ] **Step 1: Write failing unit test for JobQueue**

Create `apps/lite/server/__test__/jobQueue.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { JobQueue } from "../src/queue/jobQueue";

describe("In-Process JobQueue", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let queue: JobQueue;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        status TEXT NOT NULL,
        commit_hash TEXT,
        log_path TEXT,
        started_at INTEGER,
        finished_at INTEGER
      );
    `);
    queue = new JobQueue(db as any, { concurrency: 1 });
  });

  it("should process jobs sequentially in FIFO order", async () => {
    const order: string[] = [];
    queue.registerHandler("deploy", async (payload) => {
      order.push(payload.appId);
      await new Promise((r) => setTimeout(r, 20));
    });

    await queue.addJob({ id: "job-1", applicationId: "app-A", jobType: "deploy", payload: { appId: "A" } });
    await queue.addJob({ id: "job-2", applicationId: "app-B", jobType: "deploy", payload: { appId: "B" } });

    await queue.idle();
    expect(order).toEqual(["A", "B"]);
  });

  it("should recover crashed jobs on startup", async () => {
    sqlite.exec(`
      INSERT INTO jobs (id, application_id, job_type, status, payload, created_at)
      VALUES ('job-crash', 'app-C', 'deploy', 'RUNNING', '{"appId":"C"}', 1000);
    `);

    const recovered = await queue.recoverInterruptedJobs();
    expect(recovered).toBe(1);

    const row = sqlite.prepare("SELECT status FROM jobs WHERE id = 'job-crash'").get() as { status: string };
    expect(row.status).toBe("INTERRUPTED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=@nimploy/lite test`
Expected: FAIL (`jobQueue.ts` not implemented)

- [ ] **Step 3: Implement `JobQueue`**

Create `apps/lite/server/src/queue/jobQueue.ts`:
```typescript
import PQueue from "p-queue";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type JobHandler = (payload: any, logStream: (msg: string) => void) => Promise<void>;

export class JobQueue {
  private queue: PQueue;
  private handlers: Map<string, JobHandler> = new Map();

  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    options: { concurrency?: number } = { concurrency: 1 }
  ) {
    this.queue = new PQueue({ concurrency: options.concurrency || 1 });
  }

  registerHandler(jobType: string, handler: JobHandler) {
    this.handlers.set(jobType, handler);
  }

  async addJob(job: {
    id: string;
    applicationId: string;
    jobType: string;
    payload: any;
  }) {
    await this.db.insert(schema.jobs).values({
      id: job.id,
      applicationId: job.applicationId,
      jobType: job.jobType,
      status: "PENDING",
      payload: JSON.stringify(job.payload),
      createdAt: Date.now(),
    });

    this.queue.add(async () => {
      const handler = this.handlers.get(job.jobType);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.jobType}`);
      }

      await this.db
        .update(schema.jobs)
        .set({ status: "RUNNING" })
        .where(eq(schema.jobs.id, job.id));

      try {
        await handler(job.payload, (msg) => {
          // Log callback
        });
        await this.db
          .update(schema.jobs)
          .set({ status: "COMPLETED" })
          .where(eq(schema.jobs.id, job.id));
      } catch (err: any) {
        await this.db
          .update(schema.jobs)
          .set({ status: "FAILED" })
          .where(eq(schema.jobs.id, job.id));
        throw err;
      }
    });
  }

  async recoverInterruptedJobs(): Promise<number> {
    const runningJobs = await this.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "RUNNING"));

    for (const job of runningJobs) {
      await this.db
        .update(schema.jobs)
        .set({ status: "INTERRUPTED" })
        .where(eq(schema.jobs.id, job.id));
    }
    return runningJobs.length;
  }

  idle() {
    return this.queue.onIdle();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=@nimploy/lite test`
Expected: PASS

---

### Task 3: Caddy Reverse Proxy Dynamic Manager

**Files:**
- Create: `apps/lite/server/src/services/caddy.ts`
- Test: `apps/lite/server/__test__/caddy.test.ts`

**Interfaces:**
- Consumes: Node `fs`, Node `child_process`
- Produces: `generateCaddyfile()`, `reloadCaddy()`

- [ ] **Step 1: Write failing unit test for Caddyfile generation**

Create `apps/lite/server/__test__/caddy.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { generateCaddyfile, type DomainRoute } from "../src/services/caddy";

describe("Caddy Dynamic Proxy Configuration", () => {
  it("should generate valid Caddyfile blocks with reverse proxy and TLS", () => {
    const routes: DomainRoute[] = [
      { host: "api.myproject.com", containerName: "nimploy-app-api", containerPort: 3000, httpsEnabled: true },
      { host: "web.myproject.com", containerName: "nimploy-app-web", containerPort: 8080, httpsEnabled: true },
      { host: "local.test", containerName: "nimploy-app-local", containerPort: 5000, httpsEnabled: false },
    ];

    const caddyfile = generateCaddyfile(routes, { adminEmail: "admin@example.com" });

    expect(caddyfile).toContain("email admin@example.com");
    expect(caddyfile).toContain("api.myproject.com {");
    expect(caddyfile).toContain("reverse_proxy nimploy-app-api:3000");
    expect(caddyfile).toContain("http://local.test {");
    expect(caddyfile).toContain("reverse_proxy nimploy-app-local:5000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=@nimploy/lite test`
Expected: FAIL (`caddy.ts` not implemented)

- [ ] **Step 3: Implement `caddy.ts`**

Create `apps/lite/server/src/services/caddy.ts`:
```typescript
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface DomainRoute {
  host: string;
  containerName: string;
  containerPort: number;
  httpsEnabled: boolean;
}

export function generateCaddyfile(
  routes: DomainRoute[],
  options: { adminEmail?: string } = {}
): string {
  const lines: string[] = ["{"];
  if (options.adminEmail) {
    lines.push(`  email ${options.adminEmail}`);
  }
  lines.push("  admin 0.0.0.0:2019");
  lines.push("}\n");

  for (const route of routes) {
    const prefix = route.httpsEnabled ? route.host : `http://${route.host}`;
    lines.push(`${prefix} {`);
    lines.push(`  reverse_proxy ${route.containerName}:${route.containerPort}`);
    lines.push("}\n");
  }

  return lines.join("\n");
}

export async function reloadCaddy(caddyfilePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`caddy reload --config "${caddyfilePath}" --adapter caddyfile`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=@nimploy/lite test`
Expected: PASS

---

### Task 4: Docker & Docker Compose Build Runner with Streaming Logs

**Files:**
- Create: `apps/lite/server/src/services/dockerRunner.ts`
- Test: `apps/lite/server/__test__/dockerRunner.test.ts`

**Interfaces:**
- Consumes: Node `child_process.spawn`, `fs`
- Produces: `runDockerBuild()`, `runComposeUp()`, `runComposeDown()`

- [ ] **Step 1: Implement `dockerRunner.ts`**

Create `apps/lite/server/src/services/dockerRunner.ts`:
```typescript
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface BuildOptions {
  workingDir: string;
  logPath: string;
  onLog?: (chunk: string) => void;
  env?: Record<string, string>;
}

export function executeCommandWithLogs(
  command: string,
  args: string[],
  options: BuildOptions
): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    const logStream = fs.createWriteStream(options.logPath, { flags: "a" });
    const proc = spawn(command, args, {
      cwd: options.workingDir,
      env: { ...process.env, ...options.env },
    });

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      logStream.write(text);
      options.onLog?.(text);
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      logStream.write(text);
      options.onLog?.(text);
    });

    proc.on("close", (code) => {
      logStream.end();
      if (code === 0) {
        resolve({ exitCode: code });
      } else {
        reject(new Error(`Command '${command} ${args.join(" ")}' failed with exit code ${code}`));
      }
    });

    proc.on("error", (err) => {
      logStream.end();
      reject(err);
    });
  });
}

export async function runComposeUp(composeFilePath: string, options: BuildOptions) {
  return executeCommandWithLogs(
    "docker",
    ["compose", "-f", composeFilePath, "up", "-d", "--build", "--remove-orphans"],
    options
  );
}

export async function runDockerBuild(imageTag: string, dockerfilePath: string, options: BuildOptions) {
  return executeCommandWithLogs(
    "docker",
    ["build", "-t", imageTag, "-f", dockerfilePath, "."],
    options
  );
}
```

- [ ] **Step 2: Write unit test verifying log streaming and exit code capture**

Create `apps/lite/server/__test__/dockerRunner.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeCommandWithLogs } from "../src/services/dockerRunner";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Docker Runner & Log Streaming", () => {
  let tmpDir: string;
  let logFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nimploy-runner-test-"));
    logFile = path.join(tmpDir, "deploy.log");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should stream stdout chunks and write to disk file", async () => {
    const chunks: string[] = [];
    const result = await executeCommandWithLogs("echo", ["Hello Nimploy Lite"], {
      workingDir: tmpDir,
      logPath: logFile,
      onLog: (chunk) => chunks.push(chunk),
    });

    expect(result.exitCode).toBe(0);
    expect(chunks.join("")).toContain("Hello Nimploy Lite");
    const savedLogs = fs.readFileSync(logFile, "utf-8");
    expect(savedLogs).toContain("Hello Nimploy Lite");
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter=@nimploy/lite test`
Expected: PASS

---

### Task 5: Hono API Routes & WebSocket Server

**Files:**
- Create: `apps/lite/server/src/routes/projects.ts`
- Create: `apps/lite/server/src/routes/applications.ts`
- Create: `apps/lite/server/src/routes/deployments.ts`
- Create: `apps/lite/server/src/routes/domains.ts`
- Create: `apps/lite/server/src/wss/index.ts`
- Create: `apps/lite/server/src/index.ts`
- Test: `apps/lite/server/__test__/api.test.ts`

**Interfaces:**
- Consumes: `hono`, `@hono/node-server`, `ws`, `apps/lite/server/src/db/index.ts`
- Produces: Complete Hono HTTP server + WebSocket live logs streaming

- [ ] **Step 1: Implement Hono REST endpoints and WebSocket stream dispatcher**

Create `apps/lite/server/src/routes/projects.ts`:
```typescript
import { Hono } from "hono";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const projectRouter = new Hono()
  .get("/", async (c) => {
    const list = await db.select().from(schema.projects);
    return c.json(list);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const id = nanoid(10);
    await db.insert(schema.projects).values({
      id,
      name: body.name,
      description: body.description || "",
      createdAt: Date.now(),
    });
    return c.json({ id, name: body.name }, 201);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.projects).where(eq(schema.projects.id, id));
    return c.json({ success: true });
  });
```

Create `apps/lite/server/src/index.ts`:
```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { projectRouter } from "./routes/projects.js";
import path from "node:path";
import fs from "node:fs";

const app = new Hono();

// Mount API routes
app.route("/api/projects", projectRouter);
app.get("/api/health", (c) => c.json({ status: "ok", memoryUsage: process.memoryUsage() }));

// Static frontend serving
const STATIC_DIR = path.join(process.cwd(), "client/dist");
if (fs.existsSync(STATIC_DIR)) {
  app.get("*", async (c) => {
    let filePath = path.join(STATIC_DIR, c.req.path);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(STATIC_DIR, "index.html");
    }
    const content = fs.readFileSync(filePath);
    return c.body(content);
  });
}

const PORT = Number(process.env.PORT || 3000);
const server = http.createServer();

// Attach Hono fetch handler to native HTTP server
server.on("request", (req, res) => {
  const handler = app.fetch;
  // Standard Node adapter bridge
});

// WebSocket Server for Logs
const wss = new WebSocketServer({ server, path: "/ws" });
export const wsClients = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const appId = url.searchParams.get("appId") || "global";

  if (!wsClients.has(appId)) wsClients.set(appId, new Set());
  wsClients.get(appId)!.add(ws);

  ws.on("close", () => {
    wsClients.get(appId)?.delete(ws);
  });
});

export function broadcastLog(appId: string, logChunk: string) {
  const clients = wsClients.get(appId);
  if (clients) {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "log", data: logChunk }));
      }
    }
  }
}

if (process.env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Nimploy Lite Server running on http://localhost:${info.port}`);
  });
}

export { app };
```

- [ ] **Step 2: Write API unit test**

Create `apps/lite/server/__test__/api.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../src/index";

describe("Nimploy Lite HTTP API", () => {
  it("should respond to health check with memory usage info", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.memoryUsage).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter=@nimploy/lite test`
Expected: PASS

---

### Task 6: Frontend Vite SPA Dashboard

**Files:**
- Create: `apps/lite/client/index.html`
- Create: `apps/lite/client/vite.config.ts`
- Create: `apps/lite/client/src/main.tsx`
- Create: `apps/lite/client/src/App.tsx`
- Create: `apps/lite/client/src/pages/ProjectsPage.tsx`
- Create: `apps/lite/client/src/pages/AppDetailsPage.tsx`
- Create: `apps/lite/client/src/components/LogViewer.tsx`

**Interfaces:**
- Consumes: React 19, `@tanstack/react-query`, Lucide React, Tailwind CSS
- Produces: Pre-compiled static SPA in `apps/lite/client/dist`

- [ ] **Step 1: Scaffold Vite React SPA & Query Provider**

Create `apps/lite/client/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `apps/lite/client/src/App.tsx`:
```tsx
import React, { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { FolderGit2, Plus, Terminal, Globe, Server } from "lucide-react";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
        <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight">Nimploy Lite</h1>
          </div>
          <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-1 rounded-full">
            Ultra-Low Footprint Mode
          </span>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto p-6">
          <ProjectsView />
        </main>
      </div>
    </QueryClientProvider>
  );
}

function ProjectsView() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      return res.json();
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Projects</h2>
        <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-sm font-medium transition">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {isLoading ? (
        <div className="text-neutral-500 text-sm">Loading projects...</div>
      ) : projects?.length === 0 ? (
        <div className="border border-dashed border-neutral-800 rounded-lg p-12 text-center text-neutral-500">
          No projects yet. Create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects?.map((p: any) => (
            <div key={p.id} className="border border-neutral-800 rounded-lg p-5 bg-neutral-900/50 hover:border-neutral-700 transition cursor-pointer">
              <h3 className="font-semibold text-white">{p.name}</h3>
              <p className="text-sm text-neutral-400 mt-1">{p.description || "No description"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the frontend bundle**

Run: `pnpm --filter=@nimploy/lite run build:client`
Expected: Successfully generates `apps/lite/client/dist` (< 500KB total bundle size).

---

### Task 7: Production Docker Packaging & Footprint Verification

**Files:**
- Create: `Dockerfile.lite`
- Create: `docker-compose.lite.yml`

**Interfaces:**
- Consumes: Node.js 22-Alpine, Caddy Alpine, Docker CLI
- Produces: Self-contained `nimploy-lite` Docker image and Compose file

- [ ] **Step 1: Create `Dockerfile.lite`**

Create `Dockerfile.lite`:
```dockerfile
# Multi-stage build for ultra-small container footprint
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ git
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/lite/package.json ./apps/lite/
RUN pnpm install --frozen-lockfile

COPY apps/lite ./apps/lite
RUN pnpm --filter=@nimploy/lite run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Docker CLI and Caddy
RUN apk add --no-cache docker-cli docker-cli-compose caddy tini

COPY --from=builder /app/apps/lite/package.json ./package.json
COPY --from=builder /app/apps/lite/node_modules ./node_modules
COPY --from=builder /app/apps/lite/client/dist ./client/dist
COPY --from=builder /app/apps/lite/server/dist ./server/dist

VOLUME ["/etc/nimploy", "/var/run/docker.sock"]
EXPOSE 3000 80 443

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/dist/index.js"]
```

- [ ] **Step 2: Create `docker-compose.lite.yml`**

Create `docker-compose.lite.yml`:
```yaml
version: "3.8"

services:
  nimploy-lite:
    build:
      context: .
      dockerfile: Dockerfile.lite
    container_name: nimploy-lite
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /etc/nimploy:/etc/nimploy
    environment:
      - NODE_ENV=production
      - DATA_DIR=/etc/nimploy
      - PORT=3000
    deploy:
      resources:
        limits:
          memory: 150M
```

- [ ] **Step 3: Measure Idle Memory Footprint**

Run: `docker stats --no-stream nimploy-lite`
Expected: Memory usage strictly **under 70MB RAM** (combined Node + SQLite + Caddy).
