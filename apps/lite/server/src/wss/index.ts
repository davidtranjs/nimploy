import { WebSocketServer, WebSocket } from "ws";
import type http from "node:http";
import { db, schema } from "../db/index.js";
import { eq, or } from "drizzle-orm";
import { getContainerName } from "../services/deploymentService.js";
import { streamContainerLogsProcess } from "../services/dockerRunner.js";

export const wsClients = new Map<string, Set<WebSocket>>();

export function setupWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "", `http://${host}`);
    const appId = url.searchParams.get("appId") || "global";
    const type = url.searchParams.get("type") || "deployment";
    const tail = Number(url.searchParams.get("tail") || 100);
    const containerParam = url.searchParams.get("containerName");

    if (type === "container" && appId !== "global") {
      let proc: any = null;
      let isClosed = false;

      (async () => {
        try {
          const [app] = await db
            .select()
            .from(schema.applications)
            .where(or(eq(schema.applications.id, appId), eq(schema.applications.slug, appId)));

          if (!app) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "container-log", appId, data: "Application not found.\n" }));
            }
            return;
          }

          const containerName = containerParam || getContainerName(app);
          proc = streamContainerLogsProcess(containerName, tail);

          proc.stdout?.on("data", (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "container-log", appId, data: chunk.toString() }));
            }
          });

          proc.stderr?.on("data", (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "container-log", appId, data: chunk.toString() }));
            }
          });

          proc.on("error", (err: any) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "container-log", appId, data: `Error connecting to container logs: ${err.message}\n` }));
            }
          });

          proc.on("close", (code: number) => {
            if (code !== 0 && !isClosed && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "container-log", appId, data: `Container "${containerName}" is not running or has not been deployed yet.\n` }));
            }
          });
        } catch (err: any) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "container-log", appId, data: `Failed to stream container logs: ${err.message}\n` }));
          }
        }
      })();

      ws.on("close", () => {
        isClosed = true;
        if (proc) {
          try {
            proc.kill();
          } catch {}
        }
      });

      ws.on("error", () => {
        isClosed = true;
        if (proc) {
          try {
            proc.kill();
          } catch {}
        }
      });

      return;
    }

    if (!wsClients.has(appId)) {
      wsClients.set(appId, new Set());
    }
    wsClients.get(appId)!.add(ws);

    ws.on("close", () => {
      const set = wsClients.get(appId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          wsClients.delete(appId);
        }
      }
    });

    ws.on("error", () => {
      const set = wsClients.get(appId);
      if (set) {
        set.delete(ws);
      }
    });
  });

  return wss;
}

export function broadcastLog(appId: string, logChunk: string) {
  const message = JSON.stringify({ type: "log", appId, data: logChunk });

  const targets = new Set<WebSocket>();

  const appClients = wsClients.get(appId);
  if (appClients) {
    for (const ws of appClients) {
      targets.add(ws);
    }
  }

  // Also include global subscribers if different from appId
  if (appId !== "global") {
    const globalClients = wsClients.get("global");
    if (globalClients) {
      for (const ws of globalClients) {
        targets.add(ws);
      }
    }
  }

  for (const ws of targets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}
