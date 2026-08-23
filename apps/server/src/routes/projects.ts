import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { db, schema, sqlite } from "../db/index.js";
import { generateUniqueProjectSlug } from "../utils/slug.js";

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
			.where(or(eq(schema.projects.id, id), eq(schema.projects.slug, id)));

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
		const slug = generateUniqueProjectSlug(sqlite, body.slug || body.name);
		const createdAt = Date.now();
		const newProject = {
			id,
			name: body.name.trim(),
			slug,
			description: body.description ? String(body.description) : "",
			createdAt,
		};

		await db.insert(schema.projects).values(newProject);
		return c.json(newProject, 201);
	})
	.patch("/:id", async (c) => {
		const id = c.req.param("id");
		const body = await c.req.json().catch(() => ({}));

		const [existing] = await db
			.select()
			.from(schema.projects)
			.where(or(eq(schema.projects.id, id), eq(schema.projects.slug, id)));

		if (!existing) {
			return c.json({ error: "Project not found" }, 404);
		}

		const updateData: Partial<typeof schema.projects.$inferInsert> = {};
		if (body.name !== undefined) updateData.name = String(body.name);
		if (body.description !== undefined)
			updateData.description = String(body.description);
		if (body.slug !== undefined && String(body.slug).trim()) {
			updateData.slug = generateUniqueProjectSlug(
				sqlite,
				String(body.slug),
				existing.id,
			);
		}

		const [updated] = await db
			.update(schema.projects)
			.set(updateData)
			.where(eq(schema.projects.id, existing.id))
			.returning();

		return c.json(updated || existing);
	})
	.delete("/:id", async (c) => {
		const id = c.req.param("id");
		const [existing] = await db
			.select()
			.from(schema.projects)
			.where(or(eq(schema.projects.id, id), eq(schema.projects.slug, id)));

		if (!existing) {
			return c.json({ error: "Project not found" }, 404);
		}

		await db.delete(schema.projects).where(eq(schema.projects.id, existing.id));
		return c.json({ success: true });
	});
