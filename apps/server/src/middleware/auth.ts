import type { MiddlewareHandler } from "hono";
import { validateSession } from "../services/authService.js";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
	const path = c.req.path;

	if (
		path === "/api/auth/login" ||
		path === "/api/auth/me" ||
		path === "/api/health" ||
		!path.startsWith("/api")
	) {
		return next();
	}

	const authHeader = c.req.header("Authorization") || "";
	const token = authHeader.startsWith("Bearer ")
		? authHeader.slice(7).trim()
		: "";

	const session = validateSession(token);
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	c.set("user" as never, session);
	return next();
};
