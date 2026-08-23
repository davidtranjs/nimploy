import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import dotenv from "dotenv";
import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth.js";
import { jobQueue } from "./queue/jobQueue.js";
import { applicationRouter } from "./routes/applications.js";
import { authRouter } from "./routes/auth.js";
import { deploymentRouter } from "./routes/deployments.js";
import { domainRouter } from "./routes/domains.js";
import { projectRouter } from "./routes/projects.js";
import {
	executeDeployment,
	recoverStaleDeployments,
} from "./services/deploymentService.js";
import { broadcastLog, setupWebSocket, wsClients } from "./wss/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "apps/server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

if (process.env.NODE_ENV !== "test") {
	// Register in-process job handlers
	jobQueue.registerHandler("deploy", async (payload) => {
		await executeDeployment(payload);
	});

	// Startup recovery for interrupted or stale pending deployments
	jobQueue.recoverInterruptedJobs().catch(() => {});
	recoverStaleDeployments().catch(() => {});
}

const app = new Hono();

app.use("/api/*", authMiddleware);

// Mount API routes
app.route("/api/auth", authRouter);
app.route("/api/projects", projectRouter);
app.route("/api/applications", applicationRouter);
app.route("/api/deployments", deploymentRouter);
app.route("/api/domains", domainRouter);
app.get("/api/health", (c) =>
	c.json({
		status: "ok",
		uptime: process.uptime(),
		timestamp: Date.now(),
		memoryUsage: process.memoryUsage(),
	}),
);

// Resolve static SPA assets directory
const possibleStaticDirs = [
	path.join(process.cwd(), "client/dist"),
	path.join(process.cwd(), "apps/client/dist"),
	path.resolve(__dirname, "../../client/dist"),
	path.resolve(__dirname, "../../../client/dist"),
	path.resolve(__dirname, "../client/dist"),
];
const STATIC_DIR = possibleStaticDirs.find((dir) => fs.existsSync(dir));

function getContentType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
		case ".mjs":
			return "application/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".json":
			return "application/json; charset=utf-8";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".svg":
			return "image/svg+xml";
		case ".ico":
			return "image/x-icon";
		case ".woff2":
			return "font/woff2";
		case ".woff":
			return "font/woff";
		case ".ttf":
			return "font/ttf";
		default:
			return "application/octet-stream";
	}
}

// Fallback to static SPA for frontend client-side routing
app.get("*", async (c) => {
	if (c.req.path.startsWith("/api") || c.req.path.startsWith("/ws")) {
		return c.notFound();
	}

	if (!STATIC_DIR) {
		return c.text("Nimploy Lite API Server", 200);
	}

	let filePath = path.join(STATIC_DIR, c.req.path);
	if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
		filePath = path.join(STATIC_DIR, "index.html");
	}

	if (!fs.existsSync(filePath)) {
		return c.text("Nimploy Lite API Server", 200);
	}

	const content = fs.readFileSync(filePath);
	const contentType = getContentType(filePath);
	return c.body(content, 200, { "Content-Type": contentType });
});

const PORT = Number(process.env.PORT || 3000);
const server = http.createServer(getRequestListener(app.fetch));
setupWebSocket(server);

if (process.env.NODE_ENV !== "test") {
	server.listen(PORT, () => {
		console.log(`Nimploy Lite Server running on http://localhost:${PORT}`);
	});
}

export { app, broadcastLog, jobQueue, server, wsClients };
