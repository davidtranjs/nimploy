import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { JobQueue, type JobStatus } from "../src/queue/jobQueue";

describe("In-Process JobQueue", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let queue: JobQueue;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        status TEXT NOT NULL,
        commit_hash TEXT,
        log_path TEXT,
        started_at INTEGER,
        finished_at INTEGER
      );
    `);
    queue = new JobQueue(db as any, { concurrency: 1 });
  });

  it("should process jobs sequentially in FIFO order", async () => {
    const order: string[] = [];
    queue.registerHandler("deploy", async (payload) => {
      order.push(payload.appId);
      await new Promise((r) => setTimeout(r, 20));
    });

    await queue.addJob({ id: "job-1", applicationId: "app-A", jobType: "deploy", payload: { appId: "A" } });
    await queue.addJob({ id: "job-2", applicationId: "app-B", jobType: "deploy", payload: { appId: "B" } });

    await queue.idle();
    expect(order).toEqual(["A", "B"]);

    const rowA = sqlite.prepare("SELECT status FROM jobs WHERE id = 'job-1'").get() as { status: string };
    const rowB = sqlite.prepare("SELECT status FROM jobs WHERE id = 'job-2'").get() as { status: string };
    expect(rowA.status).toBe("COMPLETED");
    expect(rowB.status).toBe("COMPLETED");
  });

  it("should handle failed jobs by setting status to FAILED", async () => {
    queue.registerHandler("fail-job", async () => {
      throw new Error("Build failed");
    });

    await queue.addJob({ id: "job-fail", applicationId: "app-F", jobType: "fail-job", payload: {} });

    await queue.idle();

    const row = sqlite.prepare("SELECT status FROM jobs WHERE id = 'job-fail'").get() as { status: string };
    expect(row.status).toBe("FAILED");
  });

  it("should recover crashed jobs on startup", async () => {
    sqlite.exec(`
      INSERT INTO jobs (id, application_id, job_type, status, payload, created_at)
      VALUES ('job-crash', 'app-C', 'deploy', 'RUNNING', '{"appId":"C"}', 1000);
    `);

    const recovered = await queue.recoverInterruptedJobs();
    expect(recovered).toBe(1);

    const row = sqlite.prepare("SELECT status FROM jobs WHERE id = 'job-crash'").get() as { status: string };
    expect(row.status).toBe("INTERRUPTED");
  });

  it("should pass log stream callback to handler", async () => {
    const logs: string[] = [];
    queue.registerHandler("log-job", async (payload, logStream) => {
      logStream("Step 1: cloning");
      logStream("Step 2: building");
    });

    await queue.addJob({
      id: "job-log",
      applicationId: "app-L",
      jobType: "log-job",
      payload: {},
    });

    await queue.idle();
    const row = sqlite.prepare("SELECT status FROM jobs WHERE id = 'job-log'").get() as { status: string };
    expect(row.status).toBe("COMPLETED");
  });

  it("should emit status change events for lifecycle transitions", async () => {
    const events: Array<{ id: string; status: JobStatus }> = [];
    const unsubscribe = queue.onStatusChange((jobId, status) => {
      events.push({ id: jobId, status });
    });

    queue.registerHandler("event-job", async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await queue.addJob({
      id: "job-ev",
      applicationId: "app-ev",
      jobType: "event-job",
      payload: {},
    });

    await queue.idle();

    expect(events).toEqual([
      { id: "job-ev", status: "PENDING" },
      { id: "job-ev", status: "RUNNING" },
      { id: "job-ev", status: "COMPLETED" },
    ]);

    // Test unsubscribe
    unsubscribe();
    await queue.addJob({
      id: "job-ev-2",
      applicationId: "app-ev-2",
      jobType: "event-job",
      payload: {},
    });
    await queue.idle();

    expect(events.length).toBe(3);
  });
});
