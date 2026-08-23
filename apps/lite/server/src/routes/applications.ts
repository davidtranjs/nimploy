import { Hono } from "hono";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const applicationRouter = new Hono()
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    if (projectId) {
      const list = await db
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.projectId, projectId));
      return c.json(list);
    }
    const list = await db.select().from(schema.applications);
    return c.json(list);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const [appItem] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, id));

    if (!appItem) {
      return c.json({ error: "Application not found" }, 404);
    }
    return c.json(appItem);
  })
  .post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.projectId || !body.name || !body.appType) {
      return c.json(
        { error: "projectId, name, and appType are required" },
        400
      );
    }

    const id = nanoid(10);
    const createdAt = Date.now();
    const envVars =
      typeof body.envVars === "object"
        ? JSON.stringify(body.envVars)
        : typeof body.envVars === "string"
        ? body.envVars
        : "{}";

    const newApp = {
      id,
      projectId: String(body.projectId),
      name: String(body.name),
      appType: String(body.appType),
      repositoryUrl: body.repositoryUrl ? String(body.repositoryUrl) : null,
      branch: body.branch ? String(body.branch) : "main",
      dockerfilePath: body.dockerfilePath ? String(body.dockerfilePath) : "Dockerfile",
      composePath: body.composePath ? String(body.composePath) : "docker-compose.yml",
      dockerImage: body.dockerImage ? String(body.dockerImage) : null,
      envVars,
      createdAt,
    };

    await db.insert(schema.applications).values(newApp);
    return c.json(newApp, 201);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));

    const updateData: Partial<typeof schema.applications.$inferInsert> = {};
    if (body.name !== undefined) updateData.name = String(body.name);
    if (body.appType !== undefined) updateData.appType = String(body.appType);
    if (body.repositoryUrl !== undefined) updateData.repositoryUrl = body.repositoryUrl ? String(body.repositoryUrl) : null;
    if (body.branch !== undefined) updateData.branch = String(body.branch);
    if (body.dockerfilePath !== undefined) updateData.dockerfilePath = String(body.dockerfilePath);
    if (body.composePath !== undefined) updateData.composePath = String(body.composePath);
    if (body.dockerImage !== undefined) updateData.dockerImage = body.dockerImage ? String(body.dockerImage) : null;
    if (body.envVars !== undefined) {
      updateData.envVars =
        typeof body.envVars === "object"
          ? JSON.stringify(body.envVars)
        : String(body.envVars);
    }

    const [updated] = await db
      .update(schema.applications)
      .set(updateData)
      .where(eq(schema.applications.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Application not found" }, 404);
    }
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.applications).where(eq(schema.applications.id, id));
    return c.json({ success: true });
  });
