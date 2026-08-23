import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { slugify } from "../utils/slug.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

function resolveDbPath(): string {
  if (process.env.DATABASE_PATH) {
    if (process.env.DATABASE_PATH !== ":memory:") {
      const dir = path.dirname(process.env.DATABASE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    return process.env.DATABASE_PATH;
  }

  let dbDir = process.env.DATA_DIR;
  if (dbDir) {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    return path.join(dbDir, "nimploy.db");
  }

  // Attempt /etc/nimploy if writable, otherwise use local workspace .data or os.tmpdir
  try {
    fs.mkdirSync("/etc/nimploy", { recursive: true });
    return "/etc/nimploy/nimploy.db";
  } catch {
    try {
      const localDataDir = path.join(process.cwd(), ".data");
      fs.mkdirSync(localDataDir, { recursive: true });
      return path.join(localDataDir, "nimploy.db");
    } catch {
      const tmpDir = path.join(os.tmpdir(), "nimploy");
      fs.mkdirSync(tmpDir, { recursive: true });
      return path.join(tmpDir, "nimploy.db");
    }
  }
}

const dbPath = resolveDbPath();
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

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
    slug TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    app_type TEXT NOT NULL,
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
    status TEXT NOT NULL,
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
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

try {
  const projectCols = sqlite.pragma("table_info(projects)") as { name: string }[];
  if (!projectCols.some((c) => c.name === "slug")) {
    sqlite.exec("ALTER TABLE projects ADD COLUMN slug TEXT;");
    const projs = sqlite.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
    for (const p of projs) {
      const s = slugify(p.name) || p.id;
      sqlite.prepare("UPDATE projects SET slug = ? WHERE id = ?").run(s, p.id);
    }
  }
} catch {}

try {
  const appCols = sqlite.pragma("table_info(applications)") as { name: string }[];
  if (!appCols.some((c) => c.name === "slug")) {
    sqlite.exec("ALTER TABLE applications ADD COLUMN slug TEXT;");
    const apps = sqlite.prepare("SELECT id, name FROM applications").all() as { id: string; name: string }[];
    for (const a of apps) {
      const s = slugify(a.name) || a.id;
      sqlite.prepare("UPDATE applications SET slug = ? WHERE id = ?").run(s, a.id);
    }
  }
} catch {}

export const db = drizzle(sqlite, { schema });
export { sqlite, schema };
