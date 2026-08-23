import { Hono } from "hono";
import { db, schema } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";

const LOGS_DIR = process.env.LOGS_DIR || path.join(process.env.DATA_DIR || "/tmp/nimploy", "logs");
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch {
    // Ignore in read-only / test environment
  }
}

export const deploymentRouter = new Hono()
  .get("/", async (c) => {
    const applicationId = c.req.query("applicationId");
    if (applicationId) {
      const list = await db
        .select()
        .from(schema.deployments)
        .where(eq(schema.deployments.applicationId, applicationId))
        .orderBy(desc(schema.deployments.startedAt));
      return c.json(list);
    }
    const list = await db
      .select()
      .from(schema.deployments)
      .orderBy(desc(schema.deployments.startedAt));
    return c.json(list);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const [deployment] = await db
      .select()
      .from(schema.deployments)
      .where(eq(schema.deployments.id, id));

    if (!deployment) {
      return c.json({ error: "Deployment not found" }, 404);
    }
    return c.json(deployment);
  })
  .get("/:id/logs", async (c) => {
    const id = c.req.param("id");
    const [deployment] = await db
      .select()
      .from(schema.deployments)
      .where(eq(schema.deployments.id, id));

    if (!deployment) {
      return c.json({ error: "Deployment not found" }, 404);
    }

    if (deployment.logPath && fs.existsSync(deployment.logPath)) {
      const logs = fs.readFileSync(deployment.logPath, "utf-8");
      return c.text(logs);
    }

    return c.text("");
  })
  .post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.applicationId) {
      return c.json({ error: "applicationId is required" }, 400);
    }

    const id = nanoid(10);
    const logPath = path.join(LOGS_DIR, `${id}.log`);
    const newDeployment = {
      id,
      applicationId: String(body.applicationId),
      status: "PENDING",
      commitHash: body.commitHash ? String(body.commitHash) : null,
      logPath,
      startedAt: Date.now(),
      finishedAt: null,
    };

    await db.insert(schema.deployments).values(newDeployment);
    return c.json(newDeployment, 201);
  });
