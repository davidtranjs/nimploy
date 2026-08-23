import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./server/src/db/schema.ts",
	dialect: "sqlite",
	dbCredentials: {
		url: process.env.DATABASE_PATH || "./nimploy.db",
	},
	out: "./server/src/db/migrations",
});
