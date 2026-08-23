import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	executeCommandWithLogs,
	runComposeDown,
	runComposeUp,
	runDockerBuild,
} from "../src/services/dockerRunner";

describe("Docker Runner & Log Streaming", () => {
	let tmpDir: string;
	let logFile: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nimploy-runner-test-"));
		logFile = path.join(tmpDir, "deploy.log");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("should stream stdout chunks and write to disk file", async () => {
		const chunks: string[] = [];
		const result = await executeCommandWithLogs(
			"echo",
			["Hello Nimploy Lite"],
			{
				workingDir: tmpDir,
				logPath: logFile,
				onLog: (chunk) => chunks.push(chunk),
			},
		);

		expect(result.exitCode).toBe(0);
		expect(chunks.join("")).toContain("Hello Nimploy Lite");
		const savedLogs = fs.readFileSync(logFile, "utf-8");
		expect(savedLogs).toContain("Hello Nimploy Lite");
	});

	it("should capture stderr output and stream to log callbacks and file", async () => {
		const chunks: string[] = [];
		const scriptPath = path.join(tmpDir, "stderr-test.sh");
		fs.writeFileSync(
			scriptPath,
			"#!/bin/sh\necho 'Error message' >&2\nexit 0\n",
			{ mode: 0o755 },
		);

		const result = await executeCommandWithLogs(scriptPath, [], {
			workingDir: tmpDir,
			logPath: logFile,
			onLog: (chunk) => chunks.push(chunk),
		});

		expect(result.exitCode).toBe(0);
		expect(chunks.join("")).toContain("Error message");
		const savedLogs = fs.readFileSync(logFile, "utf-8");
		expect(savedLogs).toContain("Error message");
	});

	it("should reject when command exits with non-zero exit code", async () => {
		const scriptPath = path.join(tmpDir, "fail-test.sh");
		fs.writeFileSync(scriptPath, "#!/bin/sh\necho 'Failure output'\nexit 1\n", {
			mode: 0o755,
		});

		await expect(
			executeCommandWithLogs(scriptPath, [], {
				workingDir: tmpDir,
				logPath: logFile,
			}),
		).rejects.toThrow("failed with exit code 1");

		const savedLogs = fs.readFileSync(logFile, "utf-8");
		expect(savedLogs).toContain("Failure output");
	});

	it("should reject when command fails to spawn", async () => {
		await expect(
			executeCommandWithLogs("non_existent_binary_12345", [], {
				workingDir: tmpDir,
				logPath: logFile,
			}),
		).rejects.toThrow();
	});

	it("should pass custom environment variables to spawned process", async () => {
		const chunks: string[] = [];
		const scriptPath = path.join(tmpDir, "env-test.sh");
		fs.writeFileSync(
			scriptPath,
			'#!/bin/sh\necho "CUSTOM_VAL=$MY_CUSTOM_ENV_VAR"\nexit 0\n',
			{ mode: 0o755 },
		);

		const result = await executeCommandWithLogs(scriptPath, [], {
			workingDir: tmpDir,
			logPath: logFile,
			onLog: (chunk) => chunks.push(chunk),
			env: { MY_CUSTOM_ENV_VAR: "SuperSecret123" },
		});

		expect(result.exitCode).toBe(0);
		expect(chunks.join("")).toContain("CUSTOM_VAL=SuperSecret123");
	});

	it("should create log directory automatically if it does not exist", async () => {
		const nestedLogFile = path.join(tmpDir, "nested", "sub", "deploy.log");
		const result = await executeCommandWithLogs("echo", ["Nested dir test"], {
			workingDir: tmpDir,
			logPath: nestedLogFile,
		});

		expect(result.exitCode).toBe(0);
		expect(fs.existsSync(nestedLogFile)).toBe(true);
		expect(fs.readFileSync(nestedLogFile, "utf-8")).toContain(
			"Nested dir test",
		);
	});

	it("should append logs to existing log files without overwriting", async () => {
		fs.writeFileSync(logFile, "Initial line\n");

		await executeCommandWithLogs("echo", ["Appended line"], {
			workingDir: tmpDir,
			logPath: logFile,
		});

		const content = fs.readFileSync(logFile, "utf-8");
		expect(content).toContain("Initial line");
		expect(content).toContain("Appended line");
	});

	it("runDockerBuild should call executeCommandWithLogs with correct arguments", async () => {
		const scriptPath = path.join(tmpDir, "docker");
		// Mock binary that echoes its arguments
		fs.writeFileSync(scriptPath, '#!/bin/sh\necho "$@"\nexit 0\n', {
			mode: 0o755,
		});
		fs.chmodSync(scriptPath, 0o755);

		const chunks: string[] = [];
		const result = await executeCommandWithLogs(
			scriptPath,
			["build", "-t", "myapp:latest", "-f", "Dockerfile", "."],
			{
				workingDir: tmpDir,
				logPath: logFile,
				onLog: (chunk) => chunks.push(chunk),
			},
		);

		expect(result.exitCode).toBe(0);
		expect(chunks.join("")).toContain("build -t myapp:latest -f Dockerfile .");
		expect(typeof runDockerBuild).toBe("function");
		expect(typeof runComposeUp).toBe("function");
		expect(typeof runComposeDown).toBe("function");
	});
});
