import { defineConfig } from "drizzle-kit";

// No hay credenciales aquí a propósito. Este archivo solo sirve para
// `drizzle-kit generate`, que compara el esquema contra el snapshot en disco y
// no necesita hablar con Postgres. Quien aplica las migraciones es Netlify,
// justo antes de publicar el deploy, con la conexión que administra la
// plataforma.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  // Ruta obligatoria: Netlify solo recoge y aplica lo que encuentra aquí.
  // Con el `drizzle/` por defecto las migraciones se quedarían sin ejecutar.
  out: "netlify/database/migrations",
  strict: true,
  verbose: true,
});
