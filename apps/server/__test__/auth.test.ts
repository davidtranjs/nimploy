import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("Authentication API", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.ADMIN_USERNAME = "admin";
		process.env.ADMIN_PASSWORD = "secretpassword123";
	});

	afterEach(() => {
		process.env.ADMIN_USERNAME = originalEnv.ADMIN_USERNAME;
		process.env.ADMIN_PASSWORD = originalEnv.ADMIN_PASSWORD;
	});

	it("should reject login when server admin env variables are missing", async () => {
		delete process.env.ADMIN_USERNAME;
		delete process.env.ADMIN_PASSWORD;

		const res = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "admin",
				password: "secretpassword123",
			}),
		});

		expect(res.status).toBe(503);
		const data = await res.json();
		expect(data.error).toContain("Admin credentials are not configured");
	});

	it("should reject login with wrong username or password", async () => {
		const resWrongUser = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "wronguser",
				password: "secretpassword123",
			}),
		});
		expect(resWrongUser.status).toBe(401);

		const resWrongPass = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "admin",
				password: "wrongpassword",
			}),
		});
		expect(resWrongPass.status).toBe(401);
	});

	it("should login successfully with valid admin credentials and return token", async () => {
		const res = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "admin",
				password: "secretpassword123",
			}),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.token).toBeDefined();
		expect(typeof data.token).toBe("string");
		expect(data.user).toEqual({ username: "admin" });
	});

	it("should validate me endpoint with Bearer token", async () => {
		const loginRes = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "admin",
				password: "secretpassword123",
			}),
		});
		const { token } = await loginRes.json();

		const meRes = await app.request("/api/auth/me", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(meRes.status).toBe(200);
		const meData = await meRes.json();
		expect(meData.user).toEqual({ username: "admin" });

		const invalidRes = await app.request("/api/auth/me", {
			headers: { Authorization: "Bearer invalid-token" },
		});
		expect(invalidRes.status).toBe(401);
	});

	it("should handle logout and invalidate token", async () => {
		const loginRes = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "admin",
				password: "secretpassword123",
			}),
		});
		const { token } = await loginRes.json();

		const logoutRes = await app.request("/api/auth/logout", {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(logoutRes.status).toBe(200);

		const meResAfter = await app.request("/api/auth/me", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(meResAfter.status).toBe(401);
	});

	it("should protect protected API endpoints when unauthenticated", async () => {
		const res = await app.request("/api/projects");
		expect(res.status).toBe(401);
	});

	it("should allow protected API endpoints when valid token is supplied", async () => {
		const loginRes = await app.request("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: "admin",
				password: "secretpassword123",
			}),
		});
		const { token } = await loginRes.json();

		const res = await app.request("/api/projects", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
	});
});
