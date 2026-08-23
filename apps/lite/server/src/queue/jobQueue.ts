import PQueue from "p-queue";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { db } from "../db/index.js";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type JobHandler = (payload: any, logStream: (msg: string) => void) => Promise<void>;

export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "INTERRUPTED";

export type StatusChangeCallback = (
  jobId: string,
  status: JobStatus,
  error?: any
) => void;

export class JobQueue {
  private queue: PQueue;
  private handlers: Map<string, JobHandler> = new Map();
  private statusListeners: StatusChangeCallback[] = [];

  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    options: { concurrency?: number } = { concurrency: 1 }
  ) {
    this.queue = new PQueue({ concurrency: options.concurrency || 1 });
  }

  registerHandler(jobType: string, handler: JobHandler) {
    this.handlers.set(jobType, handler);
  }

  onStatusChange(callback: StatusChangeCallback): () => void {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  private emitStatusChange(
    jobId: string,
    status: JobStatus,
    error?: any
  ) {
    for (const listener of this.statusListeners) {
      try {
        listener(jobId, status, error);
      } catch {
        // Suppress listener errors so queue execution is not interrupted
      }
    }
  }

  async addJob(job: {
    id: string;
    applicationId: string;
    jobType: string;
    payload: any;
  }) {
    await this.db.insert(schema.jobs).values({
      id: job.id,
      applicationId: job.applicationId,
      jobType: job.jobType,
      status: "PENDING",
      payload: JSON.stringify(job.payload),
      createdAt: Date.now(),
    });
    this.emitStatusChange(job.id, "PENDING");

    this.queue.add(async () => {
      const handler = this.handlers.get(job.jobType);
      if (!handler) {
        const error = new Error(`No handler registered for job type: ${job.jobType}`);
        await this.db
          .update(schema.jobs)
          .set({ status: "FAILED" })
          .where(eq(schema.jobs.id, job.id));
        this.emitStatusChange(job.id, "FAILED", error);
        return;
      }

      await this.db
        .update(schema.jobs)
        .set({ status: "RUNNING" })
        .where(eq(schema.jobs.id, job.id));
      this.emitStatusChange(job.id, "RUNNING");

      try {
        await handler(job.payload, (msg) => {
          // Log callback
        });
        await this.db
          .update(schema.jobs)
          .set({ status: "COMPLETED" })
          .where(eq(schema.jobs.id, job.id));
        this.emitStatusChange(job.id, "COMPLETED");
      } catch (err: any) {
        await this.db
          .update(schema.jobs)
          .set({ status: "FAILED" })
          .where(eq(schema.jobs.id, job.id));
        this.emitStatusChange(job.id, "FAILED", err);
      }
    });
  }

  async recoverInterruptedJobs(): Promise<number> {
    const runningJobs = await this.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, "RUNNING"));

    for (const job of runningJobs) {
      await this.db
        .update(schema.jobs)
        .set({ status: "INTERRUPTED" })
        .where(eq(schema.jobs.id, job.id));
      this.emitStatusChange(job.id, "INTERRUPTED");
    }
    return runningJobs.length;
  }

  idle() {
    return this.queue.onIdle();
  }

  get size() {
    return this.queue.size;
  }

  get pending() {
    return this.queue.pending;
  }
}

export const jobQueue = new JobQueue(db, { concurrency: 1 });
