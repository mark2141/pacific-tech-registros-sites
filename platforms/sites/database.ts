import { env } from "cloudflare:workers";

export function getSitesDb(): D1Database {
  if (!env.DB) throw new Error("La base de pruebas de Sites no está disponible.");
  return env.DB;
}
