import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface BuildOptions {
  workingDir: string;
  logPath: string;
  onLog?: (chunk: string) => void;
  env?: Record<string, string>;
}

export function executeCommandWithLogs(
  command: string,
  args: string[],
  options: BuildOptions
): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    const dir = path.dirname(options.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const logStream = fs.createWriteStream(options.logPath, { flags: "a" });
    const proc = spawn(command, args, {
      cwd: options.workingDir,
      env: { ...process.env, ...options.env },
    });

    proc.stdout?.on("data", (data) => {
      const text = data.toString();
      logStream.write(text);
      options.onLog?.(text);
    });

    proc.stderr?.on("data", (data) => {
      const text = data.toString();
      logStream.write(text);
      options.onLog?.(text);
    });

    const finish = (err?: Error, code: number = 0) => {
      if (isSettled) return;
      isSettled = true;
      if (logStream.writableEnded) {
        if (err) reject(err);
        else if (code === 0) resolve({ exitCode: 0 });
        else reject(new Error(`Command '${command} ${args.join(" ")}' failed with exit code ${code}`));
      } else {
        logStream.end(() => {
          if (err) reject(err);
          else if (code === 0) resolve({ exitCode: 0 });
          else reject(new Error(`Command '${command} ${args.join(" ")}' failed with exit code ${code}`));
        });
      }
    };

    proc.on("close", (code) => {
      finish(undefined, code ?? 0);
    });

    proc.on("error", (err) => {
      finish(err);
    });
  });
}

export async function runComposeUp(composeFilePath: string, options: BuildOptions) {
  return executeCommandWithLogs(
    "docker",
    ["compose", "-f", composeFilePath, "up", "-d", "--build", "--remove-orphans"],
    options
  );
}

export async function runComposeDown(composeFilePath: string, options: BuildOptions) {
  return executeCommandWithLogs(
    "docker",
    ["compose", "-f", composeFilePath, "down", "--remove-orphans"],
    options
  );
}

export async function runDockerBuild(imageTag: string, dockerfilePath: string, options: BuildOptions) {
  return executeCommandWithLogs(
    "docker",
    ["build", "-t", imageTag, "-f", dockerfilePath, "."],
    options
  );
}

export function streamContainerLogsProcess(containerName: string, tail: number = 100) {
  return spawn("docker", ["logs", "-f", "--tail", String(tail), containerName]);
}

export async function getContainerLogs(containerName: string, tail: number = 100): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["logs", "--tail", String(tail), containerName]);
    let output = "";
    proc.stdout?.on("data", (d) => {
      output += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      output += d.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0 && !output) {
        resolve(`Container "${containerName}" is not running or has not been deployed yet.\n`);
      } else {
        resolve(output);
      }
    });
    proc.on("error", (err) => {
      resolve(`Error fetching container logs: ${err.message}\n`);
    });
  });
}

export interface AppContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  createdAt: string;
}

export async function getAppContainers(
  containerFilter: string
): Promise<AppContainerInfo[]> {
  return new Promise((resolve) => {
    const proc = spawn("docker", [
      "ps",
      "-a",
      "--filter",
      `name=${containerFilter}`,
      "--format",
      '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","state":"{{.State}}","status":"{{.Status}}","createdAt":"{{.CreatedAt}}"}',
    ]);
    let output = "";
    proc.stdout?.on("data", (d) => {
      output += d.toString();
    });
    proc.on("close", () => {
      const lines = output.trim().split("\n").filter(Boolean);
      const containers: AppContainerInfo[] = [];
      for (const line of lines) {
        try {
          containers.push(JSON.parse(line));
        } catch {}
      }
      resolve(containers);
    });
    proc.on("error", () => {
      resolve([]);
    });
  });
}
