import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at").notNull(),
});

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  appType: text("app_type").notNull(), // 'dockerfile' | 'compose' | 'image'
  repositoryUrl: text("repository_url"),
  branch: text("branch").default("main"),
  dockerfilePath: text("dockerfile_path").default("Dockerfile"),
  composePath: text("compose_path").default("docker-compose.yml"),
  dockerImage: text("docker_image"),
  envVars: text("env_vars").default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED'
  commitHash: text("commit_hash"),
  logPath: text("log_path"),
  startedAt: integer("started_at"),
  finishedAt: integer("finished_at"),
});

export const domains = sqliteTable("domains", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  host: text("host").notNull().unique(),
  containerPort: integer("container_port").notNull(),
  httpsEnabled: integer("https_enabled").default(1),
  createdAt: integer("created_at").notNull(),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull(),
  jobType: text("job_type").notNull(), // 'deploy' | 'rebuild' | 'cleanup'
  status: text("status").notNull(), // 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
