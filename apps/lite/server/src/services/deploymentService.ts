import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db, schema } from "../db/index.js";
import {
  executeCommandWithLogs,
  runDockerBuild,
  runComposeUp,
} from "./dockerRunner.js";
import { generateCaddyfile, reloadCaddy, type DomainRoute } from "./caddy.js";
import { broadcastLog } from "../wss/index.js";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const REPOS_DIR = process.env.REPOS_DIR || path.join(DATA_DIR, "repos");

export function getContainerName(app: { id: string; name?: string }): string {
  const safeName = (app.name || "app")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return `nimploy-${safeName || "app"}-${app.id}`;
}

export function parseEnvVars(rawEnv: string | null | undefined): Record<string, string> {
  if (!rawEnv || !rawEnv.trim()) return {};
  const trimmed = rawEnv.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== undefined && v !== null) {
          result[k] = String(v);
        }
      }
      return result;
    } catch {}
  }

  const result: Record<string, string> = {};
  const lines = trimmed.split("\n");
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const eqIdx = trimmedLine.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmedLine.slice(0, eqIdx).trim();
      const val = trimmedLine.slice(eqIdx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

export function envVarsToDockerArgs(envMap: Record<string, string>): string[] {
  const args: string[] = [];
  for (const [key, val] of Object.entries(envMap)) {
    args.push("-e", `${key}=${val}`);
  }
  return args;
}

export async function syncCaddyConfig(
  database: BetterSQLite3Database<typeof schema> = db,
  logStream?: (chunk: string) => void
) {
  try {
    const allDomains = await database.select().from(schema.domains);
    const routes: DomainRoute[] = [];

    for (const dom of allDomains) {
      const [app] = await database
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.id, dom.applicationId));
      if (app) {
        routes.push({
          host: dom.host,
          containerName: getContainerName(app),
          containerPort: dom.containerPort,
          httpsEnabled: Boolean(dom.httpsEnabled),
        });
      }
    }

    const caddyfileContent = generateCaddyfile(routes);
    const caddyDir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
    const caddyfilePath = process.env.CADDYFILE_PATH || path.join(caddyDir, "Caddyfile");

    if (!fs.existsSync(path.dirname(caddyfilePath))) {
      fs.mkdirSync(path.dirname(caddyfilePath), { recursive: true });
    }
    fs.writeFileSync(caddyfilePath, caddyfileContent, "utf-8");

    const reloadResult = await reloadCaddy(caddyfilePath);
    if (!reloadResult.success) {
      logStream?.(`[Caddy] Notice: Proxy reload skipped or inactive (${reloadResult.error || "not running"})\n`);
    } else {
      logStream?.(`[Caddy] Proxy configuration reloaded successfully.\n`);
    }
  } catch (err: any) {
    logStream?.(`[Caddy] Notice: Could not sync Caddy configuration: ${err.message}\n`);
  }
}

export async function recoverStaleDeployments(
  database: BetterSQLite3Database<typeof schema> = db
): Promise<number> {
  const stalePending = await database
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.status, "PENDING"));

  const staleRunning = await database
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.status, "RUNNING"));

  let count = 0;
  for (const dep of [...stalePending, ...staleRunning]) {
    await database
      .update(schema.deployments)
      .set({ status: "INTERRUPTED", finishedAt: Date.now() })
      .where(eq(schema.deployments.id, dep.id));
    count++;
  }

  return count;
}

export async function executeDeployment(
  payload: {
    deploymentId: string;
    applicationId: string;
    logPath: string;
    commitHash?: string | null;
  },
  database: BetterSQLite3Database<typeof schema> = db
) {
  const { deploymentId, applicationId, logPath } = payload;

  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const appendAndBroadcast = (msg: string) => {
    try {
      fs.appendFileSync(logPath, msg);
    } catch {}
    broadcastLog(applicationId, msg);
  };

  // 1. Mark deployment RUNNING
  await database
    .update(schema.deployments)
    .set({ status: "RUNNING" })
    .where(eq(schema.deployments.id, deploymentId));

  const [app] = await database
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, applicationId));

  if (!app) {
    const err = new Error(`Application ${applicationId} not found`);
    appendAndBroadcast(`❌ Deployment failed: Application not found\n`);
    await database
      .update(schema.deployments)
      .set({ status: "FAILED", finishedAt: Date.now() })
      .where(eq(schema.deployments.id, deploymentId));
    throw err;
  }

  appendAndBroadcast(`\n========================================\n`);
  appendAndBroadcast(`🚀 Starting deployment [${deploymentId}]\n`);
  appendAndBroadcast(`Application: ${app.name} (${app.appType.toUpperCase()})\n`);
  appendAndBroadcast(`Timestamp: ${new Date().toISOString()}\n`);
  appendAndBroadcast(`========================================\n\n`);

  const containerName = getContainerName(app);
  const parsedEnv = parseEnvVars(app.envVars);
  const envArgs = envVarsToDockerArgs(parsedEnv);

  const runnerOptions = {
    workingDir: process.cwd(),
    logPath,
    onLog: (chunk: string) => broadcastLog(applicationId, chunk),
    env: parsedEnv,
  };

  try {
    // Attempt network creation (safe ignore if already exists)
    try {
      await executeCommandWithLogs("docker", ["network", "create", "nimploy-network"], {
        ...runnerOptions,
        onLog: undefined,
      }).catch(() => {});
    } catch {}

    if (app.appType === "image") {
      if (!app.dockerImage || !app.dockerImage.trim()) {
        throw new Error("Docker image name is required for image deployment");
      }

      const img = app.dockerImage.trim();
      appendAndBroadcast(`==> [1/3] Pulling Docker image: ${img}...\n`);
      await executeCommandWithLogs("docker", ["pull", img], runnerOptions);
      appendAndBroadcast(`✓ Docker image pulled successfully.\n\n`);

      appendAndBroadcast(`==> [2/3] Cleaning up previous container '${containerName}'...\n`);
      await executeCommandWithLogs("docker", ["rm", "-f", containerName], {
        ...runnerOptions,
        onLog: undefined,
      }).catch(() => {});
      appendAndBroadcast(`✓ Container cleanup complete.\n\n`);

      appendAndBroadcast(`==> [3/3] Starting container '${containerName}'...\n`);
      const dockerRunArgs = [
        "run",
        "-d",
        "--name",
        containerName,
        "--restart",
        "unless-stopped",
        "--network",
        "nimploy-network",
        ...envArgs,
        img,
      ];

      await executeCommandWithLogs("docker", dockerRunArgs, runnerOptions);
      appendAndBroadcast(`✓ Container started successfully.\n\n`);

    } else if (app.appType === "dockerfile") {
      if (!app.repositoryUrl) {
        throw new Error("Git repository URL is required for Dockerfile deployment");
      }

      const appRepoDir = path.join(REPOS_DIR, app.id);
      if (!fs.existsSync(appRepoDir)) {
        fs.mkdirSync(appRepoDir, { recursive: true });
      }

      appendAndBroadcast(`==> [1/4] Preparing Git repository: ${app.repositoryUrl} (${app.branch || "main"})...\n`);
      if (!fs.existsSync(path.join(appRepoDir, ".git"))) {
        await executeCommandWithLogs(
          "git",
          ["clone", "--depth", "1", "-b", app.branch || "main", app.repositoryUrl, appRepoDir],
          runnerOptions
        );
      } else {
        await executeCommandWithLogs("git", ["fetch", "origin", app.branch || "main"], {
          ...runnerOptions,
          workingDir: appRepoDir,
        });
        await executeCommandWithLogs("git", ["reset", "--hard", `origin/${app.branch || "main"}`], {
          ...runnerOptions,
          workingDir: appRepoDir,
        });
      }
      appendAndBroadcast(`✓ Repository ready.\n\n`);

      const imageTag = `nimploy-${app.id}:latest`;
      appendAndBroadcast(`==> [2/4] Building Docker image '${imageTag}' from ${app.dockerfilePath || "Dockerfile"}...\n`);
      await runDockerBuild(imageTag, app.dockerfilePath || "Dockerfile", {
        ...runnerOptions,
        workingDir: appRepoDir,
      });
      appendAndBroadcast(`✓ Image build completed.\n\n`);

      appendAndBroadcast(`==> [3/4] Cleaning up previous container '${containerName}'...\n`);
      await executeCommandWithLogs("docker", ["rm", "-f", containerName], {
        ...runnerOptions,
        onLog: undefined,
      }).catch(() => {});
      appendAndBroadcast(`✓ Container cleanup complete.\n\n`);

      appendAndBroadcast(`==> [4/4] Starting container '${containerName}'...\n`);
      const dockerRunArgs = [
        "run",
        "-d",
        "--name",
        containerName,
        "--restart",
        "unless-stopped",
        "--network",
        "nimploy-network",
        ...envArgs,
        imageTag,
      ];

      await executeCommandWithLogs("docker", dockerRunArgs, {
        ...runnerOptions,
        workingDir: appRepoDir,
      });
      appendAndBroadcast(`✓ Container started successfully.\n\n`);

    } else if (app.appType === "compose") {
      if (!app.repositoryUrl) {
        throw new Error("Git repository URL is required for Docker Compose deployment");
      }

      const appRepoDir = path.join(REPOS_DIR, app.id);
      if (!fs.existsSync(appRepoDir)) {
        fs.mkdirSync(appRepoDir, { recursive: true });
      }

      appendAndBroadcast(`==> [1/2] Preparing Git repository: ${app.repositoryUrl} (${app.branch || "main"})...\n`);
      if (!fs.existsSync(path.join(appRepoDir, ".git"))) {
        await executeCommandWithLogs(
          "git",
          ["clone", "--depth", "1", "-b", app.branch || "main", app.repositoryUrl, appRepoDir],
          runnerOptions
        );
      } else {
        await executeCommandWithLogs("git", ["fetch", "origin", app.branch || "main"], {
          ...runnerOptions,
          workingDir: appRepoDir,
        });
        await executeCommandWithLogs("git", ["reset", "--hard", `origin/${app.branch || "main"}`], {
          ...runnerOptions,
          workingDir: appRepoDir,
        });
      }
      appendAndBroadcast(`✓ Repository ready.\n\n`);

      appendAndBroadcast(`==> [2/2] Starting Docker Compose stack (${app.composePath || "docker-compose.yml"})...\n`);
      await runComposeUp(app.composePath || "docker-compose.yml", {
        ...runnerOptions,
        workingDir: appRepoDir,
      });
      appendAndBroadcast(`✓ Docker Compose stack is up and running.\n\n`);
    }

    // Sync Caddy reverse proxy routes
    appendAndBroadcast(`==> Updating reverse proxy routing...\n`);
    await syncCaddyConfig(database, appendAndBroadcast);

    // Mark deployment COMPLETED
    await database
      .update(schema.deployments)
      .set({ status: "COMPLETED", finishedAt: Date.now() })
      .where(eq(schema.deployments.id, deploymentId));

    appendAndBroadcast(`\n🎉 Deployment [${deploymentId}] completed successfully!\n`);
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    appendAndBroadcast(`\n❌ Deployment [${deploymentId}] failed: ${errorMsg}\n`);

    await database
      .update(schema.deployments)
      .set({ status: "FAILED", finishedAt: Date.now() })
      .where(eq(schema.deployments.id, deploymentId));

    throw err;
  }
}
