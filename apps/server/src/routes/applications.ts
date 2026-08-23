import fs from "node:fs";
import path from "node:path";
import { and, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { db, schema, sqlite } from "../db/index.js";
import { jobQueue } from "../queue/jobQueue.js";
import { getContainerName } from "../services/deploymentService.js";
import {
	getAppContainers,
	getContainerLogs,
} from "../services/dockerRunner.js";
import { generateUniqueAppSlug } from "../utils/slug.js";

export const applicationRouter = new Hono()
	.get("/", async (c) => {
		const projectIdParam = c.req.query("projectId");
		if (projectIdParam) {
			const [proj] = await db
				.select()
				.from(schema.projects)
				.where(
					or(
						eq(schema.projects.id, projectIdParam),
						eq(schema.projects.slug, projectIdParam),
					),
				);

			const resolvedProjectId = proj ? proj.id : projectIdParam;
			const list = await db
				.select()
				.from(schema.applications)
				.where(eq(schema.applications.projectId, resolvedProjectId));
			return c.json(list);
		}
		const list = await db.select().from(schema.applications);
		return c.json(list);
	})
	.get("/:id", async (c) => {
		const id = c.req.param("id");
		const projectIdParam = c.req.query("projectId");

		let resolvedProjectId: string | undefined;
		if (projectIdParam) {
			const [proj] = await db
				.select()
				.from(schema.projects)
				.where(
					or(
						eq(schema.projects.id, projectIdParam),
						eq(schema.projects.slug, projectIdParam),
					),
				);
			if (proj) {
				resolvedProjectId = proj.id;
			}
		}

		let queryCondition = or(
			eq(schema.applications.id, id),
			eq(schema.applications.slug, id),
		);
		if (resolvedProjectId) {
			queryCondition = and(
				eq(schema.applications.projectId, resolvedProjectId),
				or(eq(schema.applications.id, id), eq(schema.applications.slug, id)),
			)!;
		}

		const [appItem] = await db
			.select()
			.from(schema.applications)
			.where(queryCondition);

		if (!appItem) {
			return c.json({ error: "Application not found" }, 404);
		}
		return c.json(appItem);
	})
	.get("/:id/containers", async (c) => {
		const id = c.req.param("id");
		const [appItem] = await db
			.select()
			.from(schema.applications)
			.where(
				or(eq(schema.applications.id, id), eq(schema.applications.slug, id)),
			);

		if (!appItem) {
			return c.json({ error: "Application not found" }, 404);
		}

		const containerName = getContainerName(appItem);
		const filter =
			appItem.appType === "compose" ? `nimploy-${appItem.id}` : containerName;
		const containers = await getAppContainers(filter);
		return c.json(containers);
	})
	.get("/:id/container-logs", async (c) => {
		const id = c.req.param("id");
		const tail = Number(c.req.query("tail") || 100);
		const containerParam = c.req.query("containerName");
		const [appItem] = await db
			.select()
			.from(schema.applications)
			.where(
				or(eq(schema.applications.id, id), eq(schema.applications.slug, id)),
			);

		if (!appItem) {
			return c.json({ error: "Application not found" }, 404);
		}

		const containerName = containerParam || getContainerName(appItem);
		const logs = await getContainerLogs(containerName, tail);
		return c.text(logs);
	})
	.post("/", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		if (!body.projectId || !body.name || !body.appType) {
			return c.json(
				{ error: "projectId, name, and appType are required" },
				400,
			);
		}

		const [proj] = await db
			.select()
			.from(schema.projects)
			.where(
				or(
					eq(schema.projects.id, String(body.projectId)),
					eq(schema.projects.slug, String(body.projectId)),
				),
			);

		const resolvedProjectId = proj ? proj.id : String(body.projectId);

		const id = nanoid(10);
		const slug = generateUniqueAppSlug(
			sqlite,
			resolvedProjectId,
			body.slug || body.name,
		);
		const createdAt = Date.now();
		const envVars =
			typeof body.envVars === "object"
				? JSON.stringify(body.envVars)
				: typeof body.envVars === "string"
					? body.envVars
					: "{}";

		const newApp = {
			id,
			projectId: resolvedProjectId,
			name: String(body.name),
			slug,
			appType: String(body.appType),
			repositoryUrl: body.repositoryUrl ? String(body.repositoryUrl) : null,
			branch: body.branch ? String(body.branch) : "main",
			dockerfilePath: body.dockerfilePath
				? String(body.dockerfilePath)
				: "Dockerfile",
			composePath: body.composePath
				? String(body.composePath)
				: "docker-compose.yml",
			dockerImage: body.dockerImage ? String(body.dockerImage) : null,
			envVars,
			createdAt,
		};

		await db.insert(schema.applications).values(newApp);

		if (
			body.autoDeploy !== false &&
			(newApp.dockerImage || newApp.repositoryUrl)
		) {
			const depId = nanoid(10);
			const logDir =
				process.env.LOGS_DIR ||
				path.join(process.env.DATA_DIR || "/tmp/nimploy", "logs");
			if (!fs.existsSync(logDir)) {
				try {
					fs.mkdirSync(logDir, { recursive: true });
				} catch {}
			}
			const logPath = path.join(logDir, `${depId}.log`);
			const initialDeployment = {
				id: depId,
				applicationId: id,
				status: "PENDING",
				commitHash: null,
				logPath,
				startedAt: Date.now(),
				finishedAt: null,
			};
			await db.insert(schema.deployments).values(initialDeployment);
			await jobQueue.addJob({
				id: `job-${depId}`,
				applicationId: id,
				jobType: "deploy",
				payload: {
					deploymentId: depId,
					applicationId: id,
					logPath,
				},
			});
		}

		return c.json(newApp, 201);
	})
	.patch("/:id", async (c) => {
		const id = c.req.param("id");
		const body = await c.req.json().catch(() => ({}));

		const [existing] = await db
			.select()
			.from(schema.applications)
			.where(
				or(eq(schema.applications.id, id), eq(schema.applications.slug, id)),
			);

		if (!existing) {
			return c.json({ error: "Application not found" }, 404);
		}

		const updateData: Partial<typeof schema.applications.$inferInsert> = {};
		if (body.name !== undefined) updateData.name = String(body.name);
		if (body.appType !== undefined) updateData.appType = String(body.appType);
		if (body.repositoryUrl !== undefined)
			updateData.repositoryUrl = body.repositoryUrl
				? String(body.repositoryUrl)
				: null;
		if (body.branch !== undefined) updateData.branch = String(body.branch);
		if (body.dockerfilePath !== undefined)
			updateData.dockerfilePath = String(body.dockerfilePath);
		if (body.composePath !== undefined)
			updateData.composePath = String(body.composePath);
		if (body.dockerImage !== undefined)
			updateData.dockerImage = body.dockerImage
				? String(body.dockerImage)
				: null;
		if (body.slug !== undefined && String(body.slug).trim()) {
			updateData.slug = generateUniqueAppSlug(
				sqlite,
				existing.projectId,
				String(body.slug),
				existing.id,
			);
		}
		if (body.envVars !== undefined) {
			updateData.envVars =
				typeof body.envVars === "object"
					? JSON.stringify(body.envVars)
					: String(body.envVars);
		}

		const [updated] = await db
			.update(schema.applications)
			.set(updateData)
			.where(eq(schema.applications.id, existing.id))
			.returning();

		return c.json(updated || existing);
	})
	.delete("/:id", async (c) => {
		const id = c.req.param("id");
		const [existing] = await db
			.select()
			.from(schema.applications)
			.where(
				or(eq(schema.applications.id, id), eq(schema.applications.slug, id)),
			);

		if (!existing) {
			return c.json({ error: "Application not found" }, 404);
		}

		await db
			.delete(schema.applications)
			.where(eq(schema.applications.id, existing.id));
		return c.json({ success: true });
	});
