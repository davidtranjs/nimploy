import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { app, broadcastLog, wsClients } from "../src/index";
import { WebSocket } from "ws";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setupWebSocket } from "../src/wss/index";

describe("Nimploy Lite HTTP API", () => {
  it("should respond to health check with memory usage info", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.memoryUsage).toBeDefined();
    expect(typeof body.memoryUsage.rss).toBe("number");
  });

  describe("Projects Route", () => {
    it("should handle project lifecycle (create, list, get, patch, delete)", async () => {
      // 1. Create project
      const createRes = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Project",
          description: "Integration test project",
        }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.id).toBeDefined();
      expect(created.name).toBe("Test Project");

      const projectId = created.id;

      // 2. List projects
      const listRes = await app.request("/api/projects");
      expect(listRes.status).toBe(200);
      const list = await listRes.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((p: any) => p.id === projectId)).toBe(true);

      // 3. Get single project
      const getRes = await app.request(`/api/projects/${projectId}`);
      expect(getRes.status).toBe(200);
      const single = await getRes.json();
      expect(single.id).toBe(projectId);
      expect(single.name).toBe("Test Project");

      // 4. Patch project
      const patchRes = await app.request(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Updated description",
        }),
      });
      expect(patchRes.status).toBe(200);
      const patched = await patchRes.json();
      expect(patched.description).toBe("Updated description");

      // 5. Delete project
      const deleteRes = await app.request(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);
      const deleteBody = await deleteRes.json();
      expect(deleteBody.success).toBe(true);

      // Verify deletion
      const getAfterDelete = await app.request(`/api/projects/${projectId}`);
      expect(getAfterDelete.status).toBe(404);
    });

    it("should validate project creation payload", async () => {
      const res = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent project patch", async () => {
      const res = await app.request("/api/projects/non-existent-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      });
      expect(res.status).toBe(404);
    });

    it("should generate friendly slugs and handle collisions and lookups by slug", async () => {
      const res1 = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Slug Unique Project" }),
      });
      expect(res1.status).toBe(201);
      const proj1 = await res1.json();
      expect(proj1.slug).toBe("slug-unique-project");

      const res2 = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Slug Unique Project" }),
      });
      expect(res2.status).toBe(201);
      const proj2 = await res2.json();
      expect(proj2.slug).toBe("slug-unique-project-2");

      const getBySlug = await app.request(`/api/projects/${proj1.slug}`);
      expect(getBySlug.status).toBe(200);
      const fetched = await getBySlug.json();
      expect(fetched.id).toBe(proj1.id);

      await app.request(`/api/projects/${proj1.id}`, { method: "DELETE" });
      await app.request(`/api/projects/${proj2.id}`, { method: "DELETE" });
    });
  });

  describe("Applications Route", () => {
    let testProjectId: string;

    beforeEach(async () => {
      const projRes = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "App Test Project" }),
      });
      const proj = await projRes.json();
      testProjectId = proj.id;
    });

    afterEach(async () => {
      if (testProjectId) {
        await app.request(`/api/projects/${testProjectId}`, { method: "DELETE" });
      }
    });

    it("should handle application lifecycle (create, list, get, patch, delete)", async () => {
      // 1. Create application
      const createRes = await app.request("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "My Web App",
          appType: "dockerfile",
          repositoryUrl: "https://github.com/example/repo.git",
          branch: "main",
          dockerfilePath: "Dockerfile",
          envVars: { PORT: "8080" },
        }),
      });
      expect(createRes.status).toBe(201);
      const appData = await createRes.json();
      expect(appData.id).toBeDefined();
      expect(appData.name).toBe("My Web App");
      expect(appData.projectId).toBe(testProjectId);
      expect(appData.appType).toBe("dockerfile");

      const appId = appData.id;

      // 2. List applications by projectId
      const listRes = await app.request(`/api/applications?projectId=${testProjectId}`);
      expect(listRes.status).toBe(200);
      const apps = await listRes.json();
      expect(apps.length).toBe(1);
      expect(apps[0].id).toBe(appId);

      // 3. Get single application
      const getRes = await app.request(`/api/applications/${appId}`);
      expect(getRes.status).toBe(200);
      const singleApp = await getRes.json();
      expect(singleApp.id).toBe(appId);
      expect(singleApp.name).toBe("My Web App");

      // 4. Update application
      const updateRes = await app.request(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated App Name",
          branch: "develop",
        }),
      });
      expect(updateRes.status).toBe(200);
      const updated = await updateRes.json();
      expect(updated.name).toBe("Updated App Name");
      expect(updated.branch).toBe("develop");

      // 5. Delete application
      const deleteRes = await app.request(`/api/applications/${appId}`, {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);

      const getAfterDelete = await app.request(`/api/applications/${appId}`);
      expect(getAfterDelete.status).toBe(404);
    });

    it("should validate application creation payload", async () => {
      const res = await app.request("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Incomplete App" }),
      });
      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent application get/patch", async () => {
      const getRes = await app.request("/api/applications/non-existent");
      expect(getRes.status).toBe(404);

      const patchRes = await app.request("/api/applications/non-existent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New" }),
      });
      expect(patchRes.status).toBe(404);
    });

    it("should generate unique app slugs and support lookup by slug and project slug", async () => {
      const res1 = await app.request("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "Frontend Service",
          appType: "dockerfile",
        }),
      });
      expect(res1.status).toBe(201);
      const app1 = await res1.json();
      expect(app1.slug).toBe("frontend-service");

      const res2 = await app.request("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "Frontend Service",
          appType: "dockerfile",
        }),
      });
      expect(res2.status).toBe(201);
      const app2 = await res2.json();
      expect(app2.slug).toBe("frontend-service-2");

      const getBySlug = await app.request(`/api/applications/${app1.slug}?projectId=${testProjectId}`);
      expect(getBySlug.status).toBe(200);
      const fetched = await getBySlug.json();
      expect(fetched.id).toBe(app1.id);
    });

    it("should return container logs text or error for an application", async () => {
      const createRes = await app.request("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "Logs App",
          appType: "dockerfile",
        }),
      });
      const created = await createRes.json();

      const logsRes = await app.request(`/api/applications/${created.id}/container-logs`);
      expect(logsRes.status).toBe(200);
      const text = await logsRes.text();
      expect(typeof text).toBe("string");

      const notFoundRes = await app.request("/api/applications/non-existent/container-logs");
      expect(notFoundRes.status).toBe(404);
    });
  });

  describe("Deployments Route", () => {
    let testProjectId: string;
    let testAppId: string;

    beforeEach(async () => {
      const projRes = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Deploy Test Project" }),
      });
      const proj = await projRes.json();
      testProjectId = proj.id;

      const appRes = await app.request("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "Deploy Test App",
          appType: "dockerfile",
        }),
      });
      const appItem = await appRes.json();
      testAppId = appItem.id;
    });

    afterEach(async () => {
      if (testProjectId) {
        await app.request(`/api/projects/${testProjectId}`, { method: "DELETE" });
      }
    });

    it("should trigger a deployment and query its status and logs", async () => {
      // 1. Trigger deployment
      const triggerRes = await app.request("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: testAppId,
          commitHash: "abc1234",
        }),
      });
      expect(triggerRes.status).toBe(201);
      const deployment = await triggerRes.json();
      expect(deployment.id).toBeDefined();
      expect(deployment.applicationId).toBe(testAppId);
      expect(deployment.status).toBe("PENDING");

      // Write mock log file
      if (deployment.logPath) {
        fs.mkdirSync(path.dirname(deployment.logPath), { recursive: true });
        fs.writeFileSync(deployment.logPath, "Deploy step 1 OK\nDeploy step 2 OK");
      }

      // 2. List deployments for application
      const listRes = await app.request(`/api/deployments?applicationId=${testAppId}`);
      expect(listRes.status).toBe(200);
      const deployments = await listRes.json();
      expect(deployments.length).toBeGreaterThanOrEqual(1);
      expect(deployments[0].id).toBe(deployment.id);

      // 3. Get single deployment
      const getRes = await app.request(`/api/deployments/${deployment.id}`);
      expect(getRes.status).toBe(200);
      const single = await getRes.json();
      expect(single.id).toBe(deployment.id);

      // 4. Get deployment logs
      const logsRes = await app.request(`/api/deployments/${deployment.id}/logs`);
      expect(logsRes.status).toBe(200);
      const logsText = await logsRes.text();
      expect(logsText).toContain("Deploy step 1 OK");
    });

    it("should validate deployment trigger payload", async () => {
      const res = await app.request("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Domains Route", () => {
    let testProjectId: string;
    let testAppId: string;

    beforeEach(async () => {
      const projRes = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Domain Test Project" }),
      });
      const proj = await projRes.json();
      testProjectId = proj.id;

      const appRes = await app.request("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: testProjectId,
          name: "Domain Test App",
          appType: "dockerfile",
        }),
      });
      const appItem = await appRes.json();
      testAppId = appItem.id;
    });

    afterEach(async () => {
      if (testProjectId) {
        await app.request(`/api/projects/${testProjectId}`, { method: "DELETE" });
      }
    });

    it("should handle domain lifecycle (create, list, get, delete)", async () => {
      // 1. Create domain
      const createRes = await app.request("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: testAppId,
          host: "app.example.com",
          containerPort: 8080,
          httpsEnabled: 1,
        }),
      });
      expect(createRes.status).toBe(201);
      const domain = await createRes.json();
      expect(domain.id).toBeDefined();
      expect(domain.host).toBe("app.example.com");
      expect(domain.containerPort).toBe(8080);

      // 2. List domains
      const listRes = await app.request(`/api/domains?applicationId=${testAppId}`);
      expect(listRes.status).toBe(200);
      const domains = await listRes.json();
      expect(domains.length).toBe(1);
      expect(domains[0].host).toBe("app.example.com");

      // 3. Get single domain
      const getRes = await app.request(`/api/domains/${domain.id}`);
      expect(getRes.status).toBe(200);
      const single = await getRes.json();
      expect(single.id).toBe(domain.id);

      // 4. Delete domain
      const deleteRes = await app.request(`/api/domains/${domain.id}`, {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);
      const delBody = await deleteRes.json();
      expect(delBody.success).toBe(true);

      const listAfter = await app.request(`/api/domains?applicationId=${testAppId}`);
      const domainsAfter = await listAfter.json();
      expect(domainsAfter.length).toBe(0);
    });

    it("should validate domain creation payload", async () => {
      const res = await app.request("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: "only-host.com" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("WebSocket Log Streaming", () => {
    let server: http.Server;
    let port: number;

    beforeEach(async () => {
      server = http.createServer();
      setupWebSocket(server);
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            port = addr.port;
          }
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("should connect client and receive broadcast logs for appId and global", async () => {
      const appId = "app-ws-test-1";
      const wsApp = new WebSocket(`ws://127.0.0.1:${port}/ws?appId=${appId}`);
      const wsGlobal = new WebSocket(`ws://127.0.0.1:${port}/ws`);

      const receivedApp: any[] = [];
      const receivedGlobal: any[] = [];

      await new Promise<void>((resolve, reject) => {
        let connectedCount = 0;
        const checkReady = () => {
          connectedCount++;
          if (connectedCount === 2) {
            broadcastLog(appId, "Build log chunk 1");
          }
        };

        wsApp.on("open", checkReady);
        wsGlobal.on("open", checkReady);

        wsApp.on("message", (data) => {
          receivedApp.push(JSON.parse(data.toString()));
          if (receivedApp.length === 1 && receivedGlobal.length === 1) {
            wsApp.close();
            wsGlobal.close();
            resolve();
          }
        });

        wsGlobal.on("message", (data) => {
          receivedGlobal.push(JSON.parse(data.toString()));
          if (receivedApp.length === 1 && receivedGlobal.length === 1) {
            wsApp.close();
            wsGlobal.close();
            resolve();
          }
        });

        wsApp.on("error", reject);
        wsGlobal.on("error", reject);
      });

      expect(receivedApp).toHaveLength(1);
      expect(receivedApp[0].data).toBe("Build log chunk 1");
      expect(receivedGlobal).toHaveLength(1);
      expect(receivedGlobal[0].data).toBe("Build log chunk 1");
    });

    it("should handle container log stream connection gracefully", async () => {
      const wsContainer = new WebSocket(`ws://127.0.0.1:${port}/ws?appId=non-existent-app&type=container`);
      const receivedMessages: any[] = [];

      await new Promise<void>((resolve, reject) => {
        wsContainer.on("message", (data) => {
          receivedMessages.push(JSON.parse(data.toString()));
          wsContainer.close();
          resolve();
        });
        wsContainer.on("error", reject);
      });

      expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
      expect(receivedMessages[0].type).toBe("container-log");
      expect(receivedMessages[0].data).toContain("Application not found");
    });
  });

  describe("Static SPA & Error Routing", () => {
    it("should return 404 for unknown api routes", async () => {
      const res = await app.request("/api/unknown-route-12345");
      expect(res.status).toBe(404);
    });

    it("should return SPA fallback for non-API route", async () => {
      const res = await app.request("/dashboard/projects");
      expect(res.status).toBe(200);
    });

    it("should return SPA fallback for project and app routes", async () => {
      const projectRes = await app.request("/project/proj_123");
      expect(projectRes.status).toBe(200);

      const appRes = await app.request("/project/proj_123/app/app_456");
      expect(appRes.status).toBe(200);
    });
  });
});
