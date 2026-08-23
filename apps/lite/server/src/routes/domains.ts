import { Hono } from "hono";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const domainRouter = new Hono()
  .get("/", async (c) => {
    const applicationId = c.req.query("applicationId");
    if (applicationId) {
      const list = await db
        .select()
        .from(schema.domains)
        .where(eq(schema.domains.applicationId, applicationId));
      return c.json(list);
    }
    const list = await db.select().from(schema.domains);
    return c.json(list);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const [domain] = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, id));

    if (!domain) {
      return c.json({ error: "Domain not found" }, 404);
    }
    return c.json(domain);
  })
  .post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.applicationId || !body.host || body.containerPort === undefined) {
      return c.json(
        { error: "applicationId, host, and containerPort are required" },
        400
      );
    }

    const id = nanoid(10);
    const newDomain = {
      id,
      applicationId: String(body.applicationId),
      host: String(body.host).trim().toLowerCase(),
      containerPort: Number(body.containerPort),
      httpsEnabled: body.httpsEnabled !== undefined ? (body.httpsEnabled ? 1 : 0) : 1,
      createdAt: Date.now(),
    };

    await db.insert(schema.domains).values(newDomain);
    return c.json(newDomain, 201);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.domains).where(eq(schema.domains.id, id));
    return c.json({ success: true });
  });
