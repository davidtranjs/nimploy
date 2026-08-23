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
    const dir = path.dirname(options.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const logStream = fs.createWriteStream(options.logPath, { flags: "a" });
    const proc = spawn(command, args, {
      cwd: options.workingDir,
      env: { ...process.env, ...options.env },
    });

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      logStream.write(text);
      options.onLog?.(text);
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      logStream.write(text);
      options.onLog?.(text);
    });

    proc.on("close", (code) => {
      logStream.end(() => {
        if (code === 0) {
          resolve({ exitCode: 0 });
        } else {
          reject(
            new Error(
              `Command '${command} ${args.join(" ")}' failed with exit code ${code}`
            )
          );
        }
      });
    });

    proc.on("error", (err) => {
      logStream.end(() => {
        reject(err);
      });
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
