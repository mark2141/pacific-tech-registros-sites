import { EquipmentConflictError, expectedVersion } from "../../lib/equipment-tracking";
import type { equipmentHistory } from "../../db/schema";
import type { ReportQuery, ReportRow } from "../../lib/equipment-reports";
import type { EquipmentActor, EquipmentListQuery, EquipmentRow, NewEquipmentInput } from "../../lib/equipment-repository";
import { buildEquipmentUpdate } from "../../lib/equipment-update";
import { escapeLikePattern, serializeEquipmentCursor } from "../../lib/equipment-query";
import { todayInPanama } from "../../lib/panama-date";
import { getSitesDb } from "./database";
import { protectPaidOrder, PaymentError } from "../../lib/payments";
import { canAccessOrder, canEditPayload } from "../../lib/permissions";

// Only these application-owned column names enter SQL. Values are always bound.
const columns = {
  id: "id", orderNumber: "order_number", invoiceNumber: "invoice_number", invoiceKind:"invoice_kind", invoiceTechnician:"invoice_technician",
  customerName: "customer_name", customerPhone: "customer_phone", customerEmail: "customer_email",
  equipmentType: "equipment_type", assignedTechnician: "assigned_technician", assignedMemberId: "assigned_member_id",
  brand: "brand", model: "model", serialNumber: "serial_number", accessories: "accessories",
  reportedIssue: "reported_issue", diagnosis: "diagnosis", damageNotes: "damage_notes",
  partsDescription: "parts_description", partsCostCents: "parts_cost_cents",
  laborDescription: "labor_description", laborCostCents: "labor_cost_cents", status: "status",
  entryDate: "entry_date", exitDate: "exit_date", invoiceSubtotalCents: "invoice_subtotal_cents",
  invoiceTaxCents: "invoice_tax_cents", invoiceTotalCents: "invoice_total_cents",
  invoiceTaxRate: "invoice_tax_rate", warrantyDays: "warranty_days", notes: "notes",
  version: "version", estimatedExitDate: "estimated_exit_date", paidCents: "paid_cents",
  createdAt: "created_at", updatedAt: "updated_at",
} as const;

const selection = Object.entries(columns).map(([key, column]) => `${column} AS "${key}"`).join(", ");
type RawRow = Omit<EquipmentRow, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
function rowFrom(raw: RawRow): EquipmentRow {
  return { ...raw, createdAt: new Date(raw.createdAt), updatedAt: new Date(raw.updatedAt) };
}

export async function listEquipment({ search, status, limit, offset, cursor, technician, entryFrom, entryTo, scopeMemberId, availableFor }: EquipmentListQuery) {
  const db = getSitesDb();
  const conditions = [status === "todos" ? "status != ?" : "status = ?"];
  const values: (string | number)[] = [status === "todos" ? "anulado" : status];
  if (search) {
    const fields = ["order_number", "invoice_number", "customer_name", "customer_phone", "customer_email", "equipment_type", "assigned_technician", "brand", "model", "serial_number", "reported_issue"];
    conditions.push(`(${fields.map(field => `${field} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    values.push(...fields.map(() => `%${escapeLikePattern(search)}%`));
  }
  if (technician) { conditions.push("assigned_technician = ?"); values.push(technician); }
  if (entryFrom) { conditions.push("entry_date >= ?"); values.push(entryFrom); }
  if (entryTo) { conditions.push("entry_date <= ?"); values.push(entryTo); }
  if(availableFor){conditions.push("assigned_member_id IS NULL AND assigned_technician IN (\x27Sin asignar\x27, ?) AND status IN (\x27ingreso\x27,\x27diagnostico\x27,\x27reparacion\x27)");values.push(availableFor);}
  if(scopeMemberId){conditions.push("assigned_member_id = ?");values.push(scopeMemberId);}
  const where = conditions.join(" AND ");
  const pageWhere = cursor ? `${where} AND id < ?` : where;
  const pageValues = cursor ? [...values, cursor.id] : [...values];
  const scopeWhere=availableFor?"WHERE assigned_member_id IS NULL AND assigned_technician IN (\x27Sin asignar\x27, ?) AND status IN (\x27ingreso\x27,\x27diagnostico\x27,\x27reparacion\x27)":scopeMemberId?"WHERE assigned_member_id=?":"";
  const scopeValues=availableFor?[availableFor]:scopeMemberId?[scopeMemberId]:[];
  const monthPrefix = `${todayInPanama().slice(0, 7)}%`;
  const results = await db.batch([
    db.prepare(`SELECT ${selection} FROM equipment WHERE ${pageWhere} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...pageValues, limit + 1, offset),
    db.prepare(`SELECT COUNT(*) AS total FROM equipment WHERE ${where}`).bind(...values),
    db.prepare(`SELECT status, COUNT(*) AS count FROM equipment ${scopeWhere} GROUP BY status`).bind(...scopeValues),
    db.prepare("SELECT COALESCE(SUM(invoice_total_cents), 0) AS revenue FROM equipment WHERE exit_date LIKE ?").bind(monthPrefix),
    db.prepare(`SELECT DISTINCT assigned_technician AS name FROM equipment ${scopeWhere} ORDER BY assigned_technician`).bind(...scopeValues),
  ]);
  const page = results[0].results as RawRow[];
  const hasMore = page.length > limit;
  const selected = hasMore ? page.slice(0, limit) : page;
  const last = selected.at(-1);
  const statusRows = results[2].results as { status: string; count: number }[];
  return {
    equipment: selected.map(rowFrom),
    technicians: (results[4].results as { name: string }[]).map(row => row.name),
    total: Number((results[1].results[0] as { total: number } | undefined)?.total ?? 0), limit, offset,
    nextCursor: hasMore && last ? serializeEquipmentCursor({ id: last.id }) : null,
    summary: {
      total: statusRows.reduce((sum, row) => sum + Number(row.count), 0),
      statusCounts: Object.fromEntries(statusRows.map(row => [row.status, Number(row.count)])),
      monthRevenueCents: Number((results[3].results[0] as { revenue: number } | undefined)?.revenue ?? 0),
    },
  };
}


export async function claimEquipment(id:number,version:number,actor:EquipmentActor,name:string){
  const db=getSitesDb();
  const results=await db.batch([
    db.prepare(`UPDATE equipment SET assigned_member_id=?,assigned_technician=?,status='reparacion',version=version+1,updated_at=?
      WHERE id=? AND version=? AND assigned_member_id IS NULL AND assigned_technician IN ('Sin asignar',?)
      AND status IN ('ingreso','diagnostico','reparacion')
      AND EXISTS(SELECT 1 FROM staff WHERE id=? AND enabled=1 AND role='tecnico' AND technician_name=?)
      RETURNING ${selection}`).bind(actor.memberId??-1,name,new Date().toISOString(),id,version,name,actor.memberId??-1,name),
    db.prepare(`INSERT INTO equipment_history(equipment_id,kind,message,to_status,actor_user_id,actor_email,created_at)
      SELECT ?,'asignacion',?,'reparacion',?,?,? WHERE changes()=1`).bind(id,`Orden tomada por: ${name} · En reparación`,actor.userId,actor.email,new Date().toISOString())
  ]);
  const raw=results[0].results[0] as RawRow|undefined;
  if(!raw)throw new EquipmentConflictError();
  return rowFrom(raw);
}

const historySelection = `id, equipment_id AS "equipmentId", kind, message, from_status AS "fromStatus",
  to_status AS "toStatus", actor_user_id AS "actorUserId", actor_email AS "actorEmail", created_at AS "createdAt"`;
type RawHistory = Omit<typeof equipmentHistory.$inferSelect, "createdAt"> & { createdAt: string };
function historyFrom(raw: RawHistory) { return { ...raw, createdAt: new Date(raw.createdAt) }; }

export async function createEquipment(values: NewEquipmentInput, prefix: string, actor: EquipmentActor) {
  const entries = Object.entries(values) as [keyof NewEquipmentInput, string | number | null][];
  const names = entries.map(([key]) => columns[key]);
  const db = getSitesDb();
  // One atomic batch couples reception and its author. last_insert_rowid belongs
  // to the preceding equipment INSERT in this same isolated transaction.
  const results = await db.batch([
    db.prepare(`INSERT INTO equipment (order_number, ${names.join(", ")})
      VALUES (? || printf('%03d', COALESCE((SELECT MAX(CAST(substr(order_number, ?) AS INTEGER))
        FROM equipment WHERE order_number LIKE ?), 0) + 1), ${entries.map(() => "?").join(", ")})
      RETURNING ${selection}`)
      .bind(prefix, prefix.length + 1, `${prefix}%`, ...entries.map(([, value]) => value)),
    db.prepare(`INSERT INTO equipment_history (equipment_id, kind, to_status, actor_user_id, actor_email, created_at)
      VALUES (last_insert_rowid(), 'ingreso', 'ingreso', ?, ?, ?)`)
      .bind(actor.userId, actor.email, new Date().toISOString()),
  ]);
  const raw = results[0].results[0] as RawRow | undefined;
  if (!raw) throw new Error("No se pudo guardar el ingreso.");
  return rowFrom(raw);
}

export async function getEquipment(id: number) {
  const raw = await getSitesDb().prepare(`SELECT ${selection} FROM equipment WHERE id = ?`).bind(id).first<RawRow>();
  return raw ? rowFrom(raw) : null;
}

export async function updateEquipment(id: number, payload: Record<string, unknown>, actor: EquipmentActor) {
  const version = expectedVersion(payload.version);
  const db = getSitesDb();
  const current = await getEquipment(id);
  if (!canAccessOrder(actor,current)) return null;
  if (!current) return null;
  if (current.version !== version) throw new EquipmentConflictError();
  if (actor.role && !canEditPayload(actor.role, payload, current.status)) throw new PaymentError("Tu rol no permite modificar esta orden.", 403);
  const values: Record<string, string | number | Date | null> = { ...buildEquipmentUpdate(current, payload), version: version + 1 };
  protectPaidOrder(current, values);
  const entries = Object.entries(values).map(([key, value]) => {
    const column = columns[key as keyof typeof columns];
    if (!column) throw new Error("Campo de actualización desconocido.");
    return { column, value: value instanceof Date ? value.toISOString() : value };
  });
  const statements = [db.prepare(`UPDATE equipment SET ${entries.map(({ column }) => `${column} = ?`).join(", ")}
    WHERE id = ? AND version = ? RETURNING ${selection}`)
    .bind(...entries.map(({ value }) => value), id, version)];
  const newStatus = typeof values.status === "string" ? values.status : current.status;
  if (newStatus !== current.status) {
    // changes() reads only the preceding conditional UPDATE in this atomic batch.
    // A losing writer inserts no history and cannot overwrite the winning edit.
    statements.push(db.prepare(`INSERT INTO equipment_history
      (equipment_id, kind, from_status, to_status, actor_user_id, actor_email, created_at)
      SELECT ?, 'estado', ?, ?, ?, ?, ? WHERE changes() = 1`)
      .bind(id, current.status, newStatus, actor.userId, actor.email, new Date().toISOString()));
  }
  if(("assignedMemberId" in values&&values.assignedMemberId!==current.assignedMemberId)||("assignedTechnician" in values&&values.assignedTechnician!==current.assignedTechnician))statements.push(db.prepare(`INSERT INTO equipment_history(equipment_id,kind,message,actor_user_id,actor_email,created_at) SELECT ?,\x27asignacion\x27,?,?,?,? WHERE changes()=1`).bind(id,`Asignación: ${current.assignedTechnician} → ${values.assignedTechnician}`,actor.userId,actor.email,new Date().toISOString()));
  const results = await db.batch(statements);
  const raw = results[0].results[0] as RawRow | undefined;
  if (!raw) throw new EquipmentConflictError();
  return rowFrom(raw);
}

export async function listEquipmentHistory(id: number, before?: number) {
  const result = await getSitesDb().prepare(`SELECT ${historySelection} FROM equipment_history
    WHERE equipment_id = ? ${before ? "AND id < ?" : ""} ORDER BY id DESC LIMIT 51`)
    .bind(...(before ? [id, before] : [id])).all<RawHistory>();
  const history = result.results.slice(0, 50).map(historyFrom);
  return { history, nextCursor: result.results.length > 50 ? String(history.at(-1)!.id) : null };
}

export async function addEquipmentNote(id: number, message: string, actor: EquipmentActor, kind: "nota" | "contacto" = "nota") {
  const raw = await getSitesDb().prepare(`INSERT INTO equipment_history
    (equipment_id, kind, message, actor_user_id, actor_email, created_at)
    SELECT id, ?, ?, ?, ?, ? FROM equipment WHERE id = ? ${actor.role==="tecnico"?"AND assigned_member_id=?":""} RETURNING ${historySelection}`)
    .bind(kind, message, actor.userId, actor.email, new Date().toISOString(), id,...(actor.role==="tecnico"?[actor.memberId??-1]:[])).first<RawHistory>();
  return raw ? historyFrom(raw) : null;
}

export async function getLastEquipmentContact(id: number) {
  const raw = await getSitesDb().prepare(`SELECT ${historySelection} FROM equipment_history
    WHERE equipment_id = ? AND kind = 'contacto' ORDER BY id DESC LIMIT 1`).bind(id).first<RawHistory>();
  return raw ? historyFrom(raw) : null;
}

export async function listReportRows(query: ReportQuery, before?: number): Promise<ReportRow[]> {
  const fields: (keyof ReportRow)[] = ["id", "orderNumber", "customerName", "equipmentType", "assignedTechnician", "status", "entryDate", "exitDate", "estimatedExitDate", "invoiceNumber", "invoiceTotalCents", "partsCostCents", "laborCostCents"];
  const selected = fields.map(key => `${columns[key]} AS "${key}"`).join(", ");
  const conditions = ["((status != 'entregado' AND status != 'anulado') OR entry_date BETWEEN ? AND ? OR exit_date BETWEEN ? AND ?)"];
  const values: (number | string)[] = [query.from, query.to, query.from, query.to];
  if (query.technician) { conditions.push("assigned_technician = ?"); values.push(query.technician); }
  if (before) { conditions.push("id < ?"); values.push(before); }
  const rows = await getSitesDb().prepare(`SELECT ${selected} FROM equipment WHERE ${conditions.join(" AND ")} ORDER BY id DESC LIMIT 500`).bind(...values).all<ReportRow>();
  return rows.results;
}
