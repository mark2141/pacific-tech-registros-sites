#!/usr/bin/env node
/**
 * Convierte un volcado JSON de la tabla `equipment` de D1 en sentencias INSERT
 * para Postgres. Escribe a stdout y no toca ninguna base de datos: el resultado
 * se revisa antes de aplicarlo.
 *
 *   wrangler d1 execute pacific-tech-registros --remote --json \
 *     --command "SELECT * FROM equipment ORDER BY id" > equipment.json
 *
 *   node scripts/d1-export-to-postgres.mjs equipment.json > equipment.sql
 *
 * Después, sobre la base ya migrada por Netlify. La cadena de conexión sale de
 * `netlify db status --show-credentials` (`netlify db connect` no sirve aquí:
 * es de solo lectura):
 *
 *   psql "<cadena de conexión>" -f equipment.sql
 */

import { readFileSync } from "node:fs";

const COLUMNS = [
  "id",
  "order_number",
  "invoice_number",
  "customer_name",
  "customer_phone",
  "customer_email",
  "equipment_type",
  "assigned_technician",
  "brand",
  "model",
  "serial_number",
  "accessories",
  "reported_issue",
  "diagnosis",
  "damage_notes",
  "parts_description",
  "parts_cost_cents",
  "labor_description",
  "labor_cost_cents",
  "status",
  "entry_date",
  "exit_date",
  "invoice_subtotal_cents",
  "invoice_tax_cents",
  "invoice_total_cents",
  "invoice_tax_rate",
  "warranty_days",
  "notes",
  "created_at",
  "updated_at",
];

const TIMESTAMP_COLUMNS = new Set(["created_at", "updated_at"]);
const NUMERIC_COLUMNS = new Set([
  "id",
  "parts_cost_cents",
  "labor_cost_cents",
  "invoice_subtotal_cents",
  "invoice_tax_cents",
  "invoice_total_cents",
  "invoice_tax_rate",
  "warranty_days",
]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * En SQLite convivían dos formatos en estas columnas: el default de la base
 * ("2026-08-21 14:00:00", UTC pero sin marca de zona) y el que escribía la
 * aplicación ("2026-08-21T14:00:00.000Z"). Sin la marca, Postgres los
 * interpretaría en la zona de la sesión y desplazaría las marcas de auditoría.
 */
function normalizeTimestamp(value) {
  const text = String(value).trim();
  if (!text) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) return text;
  return `${text.replace(" ", "T")}Z`;
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function literal(column, value) {
  if (value === null || value === undefined) return "NULL";

  if (TIMESTAMP_COLUMNS.has(column)) {
    const normalized = normalizeTimestamp(value);
    return normalized === null ? "NULL" : quote(normalized);
  }

  if (NUMERIC_COLUMNS.has(column)) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      fail(`Valor no numérico en la columna ${column}: ${JSON.stringify(value)}`);
    }
    return String(parsed);
  }

  return quote(value);
}

/** wrangler --json envuelve las filas; un export manual puede ser el array. */
function readRows(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]?.results)) {
    return parsed[0].results;
  }
  if (Array.isArray(parsed?.result) && Array.isArray(parsed.result[0]?.results)) {
    return parsed.result[0].results;
  }
  if (Array.isArray(parsed?.results)) return parsed.results;
  if (Array.isArray(parsed)) return parsed;
  fail("No se reconoció el formato del volcado: se esperaba un array de filas.");
}

const [, , inputPath] = process.argv;
if (!inputPath) {
  fail("Uso: node scripts/d1-export-to-postgres.mjs <volcado.json> > equipment.sql");
}

const rows = readRows(readFileSync(inputPath, "utf8"));
if (rows.length === 0) fail("El volcado no contiene filas.");

const missing = COLUMNS.filter((column) => !(column in rows[0]));
if (missing.length > 0) {
  fail(`Al volcado le faltan columnas: ${missing.join(", ")}`);
}

const out = [];
out.push("-- Importación única de la tabla equipment desde Cloudflare D1.");
out.push(`-- Filas: ${rows.length}`);
out.push("BEGIN;");
// Todo o nada: una importación a medias dejaría correlativos duplicados al
// reanudar, y el número de orden tiene restricción de unicidad.
out.push("");

for (const row of rows) {
  const values = COLUMNS.map((column) => literal(column, row[column]));
  out.push(
    `INSERT INTO "equipment" (${COLUMNS.map((c) => `"${c}"`).join(", ")})\nVALUES (${values.join(", ")});`,
  );
}

out.push("");
// Los id se insertan explícitamente para no romper los números de factura
// `NF-<id>` ya emitidos, así que la secuencia de identidad hay que adelantarla
// a mano: sin esto, el próximo alta chocaría contra la clave primaria.
out.push(
  `SELECT setval(pg_get_serial_sequence('equipment', 'id'), (SELECT MAX(id) FROM equipment));`,
);
out.push("");
out.push("COMMIT;");

process.stdout.write(`${out.join("\n")}\n`);
