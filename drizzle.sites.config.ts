import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/sites-schema.ts",
  out: "./db/sites-migrations",
});
