import type { EquipmentListQuery, EquipmentRow, NewEquipmentInput } from "../../lib/equipment-repository";
import { buildEquipmentUpdate } from "../../lib/equipment-update";
import { escapeLikePattern, serializeEquipmentCursor } from "../../lib/equipment-query";
import { todayInPanama } from "../../lib/panama-date";
import { getSitesDb } from "./database";

// Only these application-owned column names enter SQL. Values are always bound.
const columns = {
  id: "id", orderNumber: "order_number", invoiceNumber: "invoice_number",
  customerName: "customer_name", customerPhone: "customer_phone", customerEmail: "customer_email",
  equipmentType: "equipment_type", assignedTechnician: "assigned_technician",
  brand: "brand", model: "model", serialNumber: "serial_number", accessories: "accessories",
  reportedIssue: "reported_issue", diagnosis: "diagnosis", damageNotes: "damage_notes",
  partsDescription: "parts_description", partsCostCents: "parts_cost_cents",
  laborDescription: "labor_description", laborCostCents: "labor_cost_cents", status: "status",
  entryDate: "entry_date", exitDate: "exit_date", invoiceSubtotalCents: "invoice_subtotal_cents",
  invoiceTaxCents: "invoice_tax_cents", invoiceTotalCents: "invoice_total_cents",
  invoiceTaxRate: "invoice_tax_rate", warrantyDays: "warranty_days", notes: "notes",
  createdAt: "created_at", updatedAt: "updated_at",
} as const;

const selection = Object.entries(columns).map(([key, column]) => `${column} AS "${key}"`).join(", ");
type RawRow = Omit<EquipmentRow, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
function rowFrom(raw: RawRow): EquipmentRow {
  return { ...raw, createdAt: new Date(raw.createdAt), updatedAt: new Date(raw.updatedAt) };
}

export async function listEquipment({ search, status, limit, offset, cursor }: EquipmentListQuery) {
  const db = getSitesDb();
  const conditions = [status === "todos" ? "status != ?" : "status = ?"];
  const values: (string | number)[] = [status === "todos" ? "anulado" : status];
  if (search) {
    const fields = ["order_number", "invoice_number", "customer_name", "customer_phone", "customer_email", "equipment_type", "assigned_technician", "brand", "model", "serial_number", "reported_issue"];
    conditions.push(`(${fields.map(field => `${field} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    values.push(...fields.map(() => `%${escapeLikePattern(search)}%`));
  }
  const where = conditions.join(" AND ");
  const pageWhere = cursor ? `${where} AND id < ?` : where;
  const pageValues = cursor ? [...values, cursor.id] : [...values];
  const monthPrefix = `${todayInPanama().slice(0, 7)}%`;
  const results = await db.batch([
    db.prepare(`SELECT ${selection} FROM equipment WHERE ${pageWhere} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...pageValues, limit + 1, offset),
    db.prepare(`SELECT COUNT(*) AS total FROM equipment WHERE ${where}`).bind(...values),
    db.prepare("SELECT status, COUNT(*) AS count FROM equipment GROUP BY status"),
    db.prepare("SELECT COALESCE(SUM(invoice_total_cents), 0) AS revenue FROM equipment WHERE exit_date LIKE ?").bind(monthPrefix),
  ]);
  const page = results[0].results as RawRow[];
  const hasMore = page.length > limit;
  const selected = hasMore ? page.slice(0, limit) : page;
  const last = selected.at(-1);
  const statusRows = results[2].results as { status: string; count: number }[];
  return {
    equipment: selected.map(rowFrom),
    total: Number((results[1].results[0] as { total: number } | undefined)?.total ?? 0), limit, offset,
    nextCursor: hasMore && last ? serializeEquipmentCursor({ id: last.id }) : null,
    summary: {
      total: statusRows.reduce((sum, row) => sum + Number(row.count), 0),
      statusCounts: Object.fromEntries(statusRows.map(row => [row.status, Number(row.count)])),
      monthRevenueCents: Number((results[3].results[0] as { revenue: number } | undefined)?.revenue ?? 0),
    },
  };
}

export async function createEquipment(values: NewEquipmentInput, prefix: string) {
  const entries = Object.entries(values) as [keyof NewEquipmentInput, string][];
  const names = entries.map(([key]) => columns[key]);
  // SQLite serializes this INSERT; numbering and insertion form one operation.
  // printf's width is a minimum, so order 1000 is not truncated.
  const raw = await getSitesDb().prepare(`
    INSERT INTO equipment (order_number, ${names.join(", ")})
    VALUES (? || printf('%03d', COALESCE((
      SELECT MAX(CAST(substr(order_number, ?) AS INTEGER)) FROM equipment WHERE order_number LIKE ?
    ), 0) + 1), ${entries.map(() => "?").join(", ")})
    RETURNING ${selection}
  `).bind(prefix, prefix.length + 1, `${prefix}%`, ...entries.map(([, value]) => value)).first<RawRow>();
  if (!raw) throw new Error("No se pudo guardar el ingreso.");
  return rowFrom(raw);
}

export async function updateEquipment(id: number, payload: Record<string, unknown>) {
  const db = getSitesDb();
  // D1 has no interactive transactions. Compare the entire previous row in the
  // conditional UPDATE so a concurrent write cannot invalidate invoice totals.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await db.prepare(`SELECT ${selection} FROM equipment WHERE id = ?`).bind(id).first<RawRow>();
    if (!current) return null;
    const values = buildEquipmentUpdate(rowFrom(current), payload);
    const entries = Object.entries(values).map(([key, value]) => {
      const column = columns[key as keyof typeof columns];
      if (!column) throw new Error("Campo de actualización desconocido.");
      return { column, value: value instanceof Date ? value.toISOString() : value };
    });
    const previous = Object.entries(columns).filter(([key]) => key !== "id");
    const raw = await db.prepare(`UPDATE equipment SET ${entries.map(({ column }) => `${column} = ?`).join(", ")}
      WHERE id = ? AND ${previous.map(([, column]) => `${column} IS ?`).join(" AND ")}
      RETURNING ${selection}`)
      .bind(...entries.map(({ value }) => value), id, ...previous.map(([key]) => current[key as keyof RawRow]))
      .first<RawRow>();
    if (raw) return rowFrom(raw);
  }
  throw new Error("La orden está siendo modificada. Vuelve a intentarlo.");
}
