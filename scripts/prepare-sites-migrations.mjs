import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Drizzle 1.x stores each migration in a directory. Wrangler and Sites receive
// the same generated SQL as flat files; snapshots remain in db/sites-migrations.
const root = resolve(import.meta.dirname, "..");
await mkdir(resolve(root, "drizzle"), { recursive: true });
for (const entry of await readdir(resolve(root, "db/sites-migrations"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const sql = await readFile(resolve(root, "db/sites-migrations", entry.name, "migration.sql"), "utf8");
  const target = resolve(root, "drizzle", `${entry.name}.sql`);
  let existing;
  try { existing = await readFile(target, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing !== undefined && existing !== sql) {
    throw new Error(`La migración ${entry.name} ya existe con otro contenido. Genera una nueva.`);
  }
  if (existing === undefined) await writeFile(target, sql);
}
