import { Hono } from "hono";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const projectRouter = new Hono()
  .get("/", async (c) => {
    const list = await db.select().from(schema.projects);
    return c.json(list);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id));

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }
    return c.json(project);
  })
  .post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "Project name is required" }, 400);
    }

    const id = nanoid(10);
    const createdAt = Date.now();
    const newProject = {
      id,
      name: body.name.trim(),
      description: body.description ? String(body.description) : "",
      createdAt,
    };

    await db.insert(schema.projects).values(newProject);
    return c.json(newProject, 201);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));

    const updateData: Partial<typeof schema.projects.$inferInsert> = {};
    if (body.name !== undefined) updateData.name = String(body.name);
    if (body.description !== undefined) updateData.description = String(body.description);

    const [updated] = await db
      .update(schema.projects)
      .set(updateData)
      .where(eq(schema.projects.id, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Project not found" }, 404);
    }
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.projects).where(eq(schema.projects.id, id));
    return c.json({ success: true });
  });
