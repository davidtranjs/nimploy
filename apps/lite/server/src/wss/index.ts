import { WebSocketServer, WebSocket } from "ws";
import type http from "node:http";

export const wsClients = new Map<string, Set<WebSocket>>();

export function setupWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "", `http://${host}`);
    const appId = url.searchParams.get("appId") || "global";

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
