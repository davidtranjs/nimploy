import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import {
  parseEnvVars,
  envVarsToDockerArgs,
  getContainerName,
  recoverStaleDeployments,
  executeDeployment,
} from "../src/services/deploymentService";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { eq } from "drizzle-orm";

describe("Deployment Service", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let tmpDir: string;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    sqlite.exec(`
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
    `);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nimploy-deploy-test-"));
  });

  describe("Utility functions", () => {
    it("should parse environment variables from JSON and KEY=VALUE format", () => {
      const jsonEnv = JSON.stringify({ PORT: "8080", NODE_ENV: "production" });
      expect(parseEnvVars(jsonEnv)).toEqual({ PORT: "8080", NODE_ENV: "production" });

      const textEnv = "PORT=3000\nDATABASE_URL=postgres://localhost/db\n# A comment\nEMPTY_VAL=";
      expect(parseEnvVars(textEnv)).toEqual({
        PORT: "3000",
        DATABASE_URL: "postgres://localhost/db",
        EMPTY_VAL: "",
      });

      expect(parseEnvVars("")).toEqual({});
      expect(parseEnvVars(null)).toEqual({});
    });

    it("should convert env map to docker run CLI args", () => {
      const envMap = { PORT: "8080", APP_ENV: "prod" };
      const args = envVarsToDockerArgs(envMap);
      expect(args).toEqual(["-e", "PORT=8080", "-e", "APP_ENV=prod"]);
    });

    it("should generate safe docker container names", () => {
      expect(getContainerName({ id: "app-123", name: "My Web Application!" })).toBe(
        "nimploy-my-web-application-app-123"
      );
      expect(getContainerName({ id: "xyz", name: "---abc---" })).toBe("nimploy-abc-xyz");
      expect(getContainerName({ id: "9Mb-g0SD73", name: "xyz" })).toBe("nimploy-xyz-9Mb-g0SD73");
    });
  });

  describe("recoverStaleDeployments", () => {
    it("should mark PENDING and RUNNING deployments as INTERRUPTED on startup recovery", async () => {
      await db.insert(schema.projects).values({
        id: "p1",
        name: "Test",
        createdAt: Date.now(),
      });
      await db.insert(schema.applications).values({
        id: "a1",
        projectId: "p1",
        name: "App",
        appType: "image",
        createdAt: Date.now(),
      });

      await db.insert(schema.deployments).values([
        {
          id: "dep-pending",
          applicationId: "a1",
          status: "PENDING",
          startedAt: Date.now() - 10000,
        },
        {
          id: "dep-running",
          applicationId: "a1",
          status: "RUNNING",
          startedAt: Date.now() - 5000,
        },
        {
          id: "dep-done",
          applicationId: "a1",
          status: "COMPLETED",
          startedAt: Date.now() - 20000,
          finishedAt: Date.now() - 15000,
        },
      ]);

      const count = await recoverStaleDeployments(db as any);
      expect(count).toBe(2);

      const [pendingDep] = await db
        .select()
        .from(schema.deployments)
        .where(eq(schema.deployments.id, "dep-pending"));
      const [runningDep] = await db
        .select()
        .from(schema.deployments)
        .where(eq(schema.deployments.id, "dep-running"));
      const [doneDep] = await db
        .select()
        .from(schema.deployments)
        .where(eq(schema.deployments.id, "dep-done"));

      expect(pendingDep.status).toBe("INTERRUPTED");
      expect(runningDep.status).toBe("INTERRUPTED");
      expect(doneDep.status).toBe("COMPLETED");
    });
  });

  describe("executeDeployment", () => {
    it("should fail gracefully when application is not found in database", async () => {
      const logFile = path.join(tmpDir, "dep-fail.log");
      await db.insert(schema.projects).values({
        id: "p1",
        name: "Test",
        createdAt: Date.now(),
      });
      await db.insert(schema.applications).values({
        id: "a-temp",
        projectId: "p1",
        name: "Temp App",
        appType: "image",
        createdAt: Date.now(),
      });
      await db.insert(schema.deployments).values({
        id: "dep-not-found",
        applicationId: "a-temp",
        status: "PENDING",
        logPath: logFile,
        startedAt: Date.now(),
      });

      // Temporarily remove application to simulate non-existent app scenario
      sqlite.pragma("foreign_keys = OFF");
      sqlite.prepare("DELETE FROM applications WHERE id = 'a-temp'").run();
      sqlite.pragma("foreign_keys = ON");

      await expect(
        executeDeployment(
          {
            deploymentId: "dep-not-found",
            applicationId: "a-temp",
            logPath: logFile,
          },
          db as any
        )
      ).rejects.toThrow("Application a-temp not found");

      const [dep] = await db
        .select()
        .from(schema.deployments)
        .where(eq(schema.deployments.id, "dep-not-found"));
      expect(dep.status).toBe("FAILED");
      expect(dep.finishedAt).toBeDefined();

      const logText = fs.readFileSync(logFile, "utf-8");
      expect(logText).toContain("Application not found");
    });

    it("should fail gracefully when image app has empty docker image string", async () => {
      const logFile = path.join(tmpDir, "dep-no-img.log");
      await db.insert(schema.projects).values({
        id: "p1",
        name: "Test",
        createdAt: Date.now(),
      });
      await db.insert(schema.applications).values({
        id: "a-no-img",
        projectId: "p1",
        name: "No Image App",
        appType: "image",
        dockerImage: "",
        createdAt: Date.now(),
      });
      await db.insert(schema.deployments).values({
        id: "dep-no-img",
        applicationId: "a-no-img",
        status: "PENDING",
        logPath: logFile,
        startedAt: Date.now(),
      });

      await expect(
        executeDeployment(
          {
            deploymentId: "dep-no-img",
            applicationId: "a-no-img",
            logPath: logFile,
          },
          db as any
        )
      ).rejects.toThrow("Docker image name is required");

      const [dep] = await db
        .select()
        .from(schema.deployments)
        .where(eq(schema.deployments.id, "dep-no-img"));
      expect(dep.status).toBe("FAILED");
    });
  });
});
