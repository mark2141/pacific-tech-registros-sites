import { EquipmentConflictError, expectedVersion } from "../../lib/equipment-tracking";
import type { ReportQuery, ReportRow } from "../../lib/equipment-reports";
import {
  and,
  count,
  desc,
  eq,
  gte,
  lte,
  asc,
  ilike,
  like,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "../../db";
import { protectPaidOrder, PaymentError } from "../../lib/payments";
import { canAccessOrder, canEditPayload } from "../../lib/permissions";
import { equipment, equipmentHistory } from "../../db/schema";
import { isUniqueConstraintError } from "../../lib/database-error";
import { buildEquipmentUpdate } from "../../lib/equipment-update";
import { monthlyOrderNumber } from "./order-number";
import { todayInPanama } from "../../lib/panama-date";
import { escapeLikePattern, serializeEquipmentCursor } from "../../lib/equipment-query";
import type { EquipmentActor, EquipmentListQuery, NewEquipmentInput } from "../../lib/equipment-repository";

export async function listEquipment({ search, status, limit, offset, cursor, technician, entryFrom, entryTo, scopeMemberId }: EquipmentListQuery) {
    const db = getDb();

    // La búsqueda se ejecuta sobre toda la tabla, no solo sobre los cien
    // registros ya cargados por el navegador. Los comodines escritos por la
    // persona se escapan: buscar "_" o "%" sigue siendo una búsqueda literal.
    const searchPattern = search ? `%${escapeLikePattern(search)}%` : null;
    const searchCondition = searchPattern
      ? or(
          ilike(equipment.orderNumber, searchPattern),
          ilike(equipment.invoiceNumber, searchPattern),
          ilike(equipment.customerName, searchPattern),
          ilike(equipment.customerPhone, searchPattern),
          ilike(equipment.customerEmail, searchPattern),
          ilike(equipment.equipmentType, searchPattern),
          ilike(equipment.assignedTechnician, searchPattern),
          ilike(equipment.brand, searchPattern),
          ilike(equipment.model, searchPattern),
          ilike(equipment.serialNumber, searchPattern),
          ilike(equipment.reportedIssue, searchPattern),
        )
      : undefined;
    const statusCondition =
      status === "todos"
        ? ne(equipment.status, "anulado")
        : eq(equipment.status, status);
    const scopeCondition=scopeMemberId?eq(equipment.assignedMemberId,scopeMemberId):undefined;
    const listCondition = and(statusCondition, searchCondition,scopeCondition,
      technician ? eq(equipment.assignedTechnician, technician) : undefined,
      entryFrom ? gte(equipment.entryDate, entryFrom) : undefined,
      entryTo ? lte(equipment.entryDate, entryTo) : undefined);

    // `id` no cambia al editar una orden. Paginar por él evita que una edición
    // concurrente mueva una fila desde debajo del cursor hasta encima y la deje
    // fuera del recorrido actual.
    const cursorCondition = cursor
      ? lt(equipment.id, cursor.id)
      : undefined;
    const pageCondition = and(listCondition, cursorCondition);

    // Los totales se agregan en SQL sobre toda la tabla. Calcularlos en el
    // cliente solo veía la página cargada, así que a partir de PAGE_SIZE
    // órdenes los contadores y lo facturado del mes quedaban por debajo.
    const monthPrefix = `${todayInPanama().slice(0, 7)}%`;
    const [pageRows, [matching], statusRows, [revenue], technicians] = await Promise.all([
      db
        .select()
        .from(equipment)
        .where(pageCondition)
        .orderBy(desc(equipment.id))
        .limit(limit + 1)
        .offset(offset),
      db
        .select({ total: count() })
        .from(equipment)
        .where(listCondition),
      db
        .select({ status: equipment.status, count: count() })
        .from(equipment)
        .where(scopeCondition).groupBy(equipment.status),
      db
        .select({
          monthRevenueCents: sql<number>`COALESCE(SUM(${equipment.invoiceTotalCents}), 0)`,
        })
        .from(equipment)
        .where(like(equipment.exitDate, monthPrefix)),
      db.selectDistinct({ name: equipment.assignedTechnician }).from(equipment).where(scopeCondition).orderBy(asc(equipment.assignedTechnician)),
    ]);

    const hasMore = pageRows.length > limit;
    const selectedRows = hasMore ? pageRows.slice(0, limit) : pageRows;
    const lastRow = selectedRows.at(-1);
    const nextCursor = hasMore && lastRow
      ? serializeEquipmentCursor({ id: lastRow.id })
      : null;

    const statusCounts = Object.fromEntries(
      statusRows.map((row) => [row.status, Number(row.count)]),
    );
    const globalTotal = statusRows.reduce(
      (sum, row) => sum + Number(row.count),
      0,
    );

    return {
      equipment: selectedRows,
      technicians: technicians.map(row => row.name),
      total: Number(matching?.total ?? 0),
      limit,
      offset,
      nextCursor,
      summary: {
        total: globalTotal,
        statusCounts,
        monthRevenueCents: Number(revenue?.monthRevenueCents ?? 0),
      },
    };
}

export async function createEquipment(values: NewEquipmentInput, prefix: string, actor: EquipmentActor) {
  const db = getDb();
  let lastUniqueError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await db.transaction(async tx => {
        const [row] = await tx.insert(equipment).values({ ...values, orderNumber: monthlyOrderNumber(prefix) }).returning();
        if (!row) throw new Error("No se pudo guardar el ingreso.");
        await tx.insert(equipmentHistory).values({ equipmentId: row.id, kind: "ingreso", toStatus: row.status,
          actorUserId: actor.userId, actorEmail: actor.email });
        return row;
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      lastUniqueError = error;
    }
  }
  throw lastUniqueError || new Error("No se pudo generar el número de orden.");
}

export async function getEquipment(id: number) {
  const [row] = await getDb().select().from(equipment).where(eq(equipment.id, id)).limit(1);
  return row ?? null;
}

export async function updateEquipment(id: number, payload: Record<string, unknown>, actor: EquipmentActor) {
  const version = expectedVersion(payload.version);
  return getDb().transaction(async tx => {
    const [current] = await tx.select().from(equipment).where(eq(equipment.id, id)).limit(1).for("update");
    if (!canAccessOrder(actor,current)) return null;
    if (!current) return null;
    if (current.version !== version) throw new EquipmentConflictError();
    if (actor.role && !canEditPayload(actor.role, payload, current.status)) throw new PaymentError("Tu rol no permite modificar esta orden.", 403);
    const values = buildEquipmentUpdate(current, payload);
    protectPaidOrder(current, values);
    const [updated] = await tx.update(equipment).set({ ...values, version: version + 1 })
      .where(and(eq(equipment.id, id), eq(equipment.version, version))).returning();
    if (!updated) throw new EquipmentConflictError();
    if (updated.status !== current.status) {
      await tx.insert(equipmentHistory).values({ equipmentId: id, kind: "estado",
        fromStatus: current.status, toStatus: updated.status, actorUserId: actor.userId, actorEmail: actor.email });
    }
    if("assignedMemberId" in values&&values.assignedMemberId!==current.assignedMemberId)await tx.insert(equipmentHistory).values({equipmentId:id,kind:"asignacion",message:`Asignación: ${current.assignedTechnician} → ${updated.assignedTechnician}`,actorUserId:actor.userId,actorEmail:actor.email});
    return updated;
  });
}

export async function listEquipmentHistory(id: number, before?: number) {
  const rows = await getDb().select().from(equipmentHistory)
    .where(and(eq(equipmentHistory.equipmentId, id), before ? lt(equipmentHistory.id, before) : undefined))
    .orderBy(desc(equipmentHistory.id)).limit(51);
  const history = rows.slice(0, 50);
  return { history, nextCursor: rows.length > 50 ? String(history.at(-1)!.id) : null };
}

export async function addEquipmentNote(id: number, message: string, actor: EquipmentActor, kind: "nota" | "contacto" = "nota") {
  return getDb().transaction(async tx => {
    const [row] = await tx.select().from(equipment).where(eq(equipment.id, id)).limit(1).for("update");
    if(!canAccessOrder(actor,row))return null;
    if (!row) return null;
    const [event] = await tx.insert(equipmentHistory).values({ equipmentId: id, kind, message,
      actorUserId: actor.userId, actorEmail: actor.email }).returning();
    return event;
  });
}

export async function getLastEquipmentContact(id: number) {
  const [event] = await getDb().select().from(equipmentHistory)
    .where(and(eq(equipmentHistory.equipmentId, id), eq(equipmentHistory.kind, "contacto")))
    .orderBy(desc(equipmentHistory.id)).limit(1);
  return event ?? null;
}

export async function listReportRows(query: ReportQuery, before?: number): Promise<ReportRow[]> {
  return getDb().select({ id: equipment.id, orderNumber: equipment.orderNumber, customerName: equipment.customerName,
    equipmentType: equipment.equipmentType, assignedTechnician: equipment.assignedTechnician,
    status: equipment.status, entryDate: equipment.entryDate, exitDate: equipment.exitDate,
    estimatedExitDate: equipment.estimatedExitDate, invoiceNumber: equipment.invoiceNumber,
    invoiceTotalCents: equipment.invoiceTotalCents, partsCostCents: equipment.partsCostCents, laborCostCents: equipment.laborCostCents })
    .from(equipment).where(and(
      before ? lt(equipment.id, before) : undefined,
      query.technician ? eq(equipment.assignedTechnician, query.technician) : undefined,
      or(and(ne(equipment.status, "entregado"), ne(equipment.status, "anulado")),
        and(gte(equipment.entryDate, query.from), lte(equipment.entryDate, query.to)),
        and(gte(equipment.exitDate, query.from), lte(equipment.exitDate, query.to))),
    )).orderBy(desc(equipment.id)).limit(500);
}
