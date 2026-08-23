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
