import { exec } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
	type DomainRoute,
	generateCaddyfile,
	reloadCaddy,
} from "../src/services/caddy";

vi.mock("node:child_process", () => {
	return {
		exec: vi.fn(),
	};
});

describe("Caddy Dynamic Proxy Configuration", () => {
	it("should generate valid Caddyfile blocks with reverse proxy and TLS", () => {
		const routes: DomainRoute[] = [
			{
				host: "api.myproject.com",
				containerName: "nimploy-app-api",
				containerPort: 3000,
				httpsEnabled: true,
			},
			{
				host: "web.myproject.com",
				containerName: "nimploy-app-web",
				containerPort: 8080,
				httpsEnabled: true,
			},
			{
				host: "local.test",
				containerName: "nimploy-app-local",
				containerPort: 5000,
				httpsEnabled: false,
			},
		];

		const caddyfile = generateCaddyfile(routes, {
			adminEmail: "admin@example.com",
		});

		expect(caddyfile).toContain("email admin@example.com");
		expect(caddyfile).toContain("admin 0.0.0.0:2019");
		expect(caddyfile).toContain("api.myproject.com {");
		expect(caddyfile).toContain("reverse_proxy nimploy-app-api:3000");
		expect(caddyfile).toContain("web.myproject.com {");
		expect(caddyfile).toContain("reverse_proxy nimploy-app-web:8080");
		expect(caddyfile).toContain("http://local.test {");
		expect(caddyfile).toContain("reverse_proxy nimploy-app-local:5000");
	});

	it("should generate Caddyfile without email when adminEmail is not provided", () => {
		const routes: DomainRoute[] = [
			{
				host: "demo.example.com",
				containerName: "demo-app",
				containerPort: 3000,
				httpsEnabled: true,
			},
		];

		const caddyfile = generateCaddyfile(routes);

		expect(caddyfile).not.toContain("email");
		expect(caddyfile).toContain("admin 0.0.0.0:2019");
		expect(caddyfile).toContain("demo.example.com {");
		expect(caddyfile).toContain("reverse_proxy demo-app:3000");
	});

	it("should handle empty routes list", () => {
		const caddyfile = generateCaddyfile([]);

		expect(caddyfile).toContain("admin 0.0.0.0:2019");
		expect(caddyfile).not.toContain("reverse_proxy");
	});

	describe("reloadCaddy", () => {
		it("should return success when caddy reload succeeds", async () => {
			vi.mocked(exec).mockImplementation(((_cmd: string, callback: any) => {
				callback(null, { stdout: "", stderr: "" });
				return {} as any;
			}) as any);

			const result = await reloadCaddy("/etc/caddy/Caddyfile");
			expect(result.success).toBe(true);
			expect(result.error).toBeUndefined();
			expect(exec).toHaveBeenCalledWith(
				'caddy reload --config "/etc/caddy/Caddyfile" --adapter caddyfile',
				expect.any(Function),
			);
		});

		it("should return error message when caddy reload fails", async () => {
			vi.mocked(exec).mockImplementation(((_cmd: string, callback: any) => {
				callback(new Error("Caddy process not running"), {
					stdout: "",
					stderr: "",
				});
				return {} as any;
			}) as any);

			const result = await reloadCaddy("/invalid/path/Caddyfile");
			expect(result.success).toBe(false);
			expect(result.error).toContain("Caddy process not running");
		});
	});
});
