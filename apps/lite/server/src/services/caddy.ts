import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface DomainRoute {
  host: string;
  containerName: string;
  containerPort: number;
  httpsEnabled: boolean;
}

export function generateCaddyfile(
  routes: DomainRoute[],
  options: { adminEmail?: string } = {}
): string {
  const lines: string[] = ["{"];
  if (options.adminEmail) {
    lines.push(`  email ${options.adminEmail}`);
  }
  lines.push("  admin 0.0.0.0:2019");
  lines.push("}\n");

  for (const route of routes) {
    const prefix = route.httpsEnabled ? route.host : `http://${route.host}`;
    lines.push(`${prefix} {`);
    lines.push(`  reverse_proxy ${route.containerName}:${route.containerPort}`);
    lines.push("}\n");
  }

  return lines.join("\n");
}

export async function reloadCaddy(caddyfilePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`caddy reload --config "${caddyfilePath}" --adapter caddyfile`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
