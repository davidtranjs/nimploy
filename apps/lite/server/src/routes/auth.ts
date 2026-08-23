import { Hono } from "hono";
import {
	createSession,
	revokeSession,
	validateSession,
} from "../services/authService.js";

export const authRouter = new Hono()
	.post("/login", async (c) => {
		const adminUser = process.env.ADMIN_USERNAME?.trim();
		const adminPass = process.env.ADMIN_PASSWORD?.trim();

		if (!adminUser || !adminPass) {
			return c.json(
				{
					error:
						"Admin credentials are not configured in environment variables (ADMIN_USERNAME, ADMIN_PASSWORD)",
				},
				503,
			);
		}

		const body = await c.req.json().catch(() => ({}));
		const { username, password } = body;

		if (!username || !password) {
			return c.json({ error: "Username and password are required" }, 400);
		}

		if (username !== adminUser || password !== adminPass) {
			return c.json({ error: "Invalid username or password" }, 401);
		}

		const token = createSession(adminUser);
		return c.json({ token, user: { username: adminUser } });
	})
	.get("/me", async (c) => {
		const authHeader = c.req.header("Authorization") || "";
		const token = authHeader.startsWith("Bearer ")
			? authHeader.slice(7).trim()
			: "";

		const session = validateSession(token);
		if (!session) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		return c.json({ user: session });
	})
	.post("/logout", async (c) => {
		const authHeader = c.req.header("Authorization") || "";
		const token = authHeader.startsWith("Bearer ")
			? authHeader.slice(7).trim()
			: "";

		if (token) {
			revokeSession(token);
		}

		return c.json({ success: true });
	});
