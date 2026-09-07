import {
  and,
  count,
  desc,
  eq,
  ilike,
  like,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "../../db";
import { equipment } from "../../db/schema";
import { isUniqueConstraintError } from "../../lib/database-error";
import { buildEquipmentUpdate } from "../../lib/equipment-update";
import { ORDER_SEQUENCE_WIDTH } from "../../lib/order-number";
import { todayInPanama } from "../../lib/panama-date";
import { escapeLikePattern, serializeEquipmentCursor } from "../../lib/equipment-query";
import type { EquipmentListQuery, NewEquipmentInput } from "../../lib/equipment-repository";

function monthlyOrderNumber(prefix: string) {
  const suffixStart = prefix.length + 1;
  const monthlyPattern = `${prefix}%`;

  // Postgres aborta la consulta si un CAST a INTEGER falla, mientras que SQLite
  // devolvía cero en silencio. El filtro sobre el sufijo garantiza que solo
  // entren correlativos numéricos, de modo que un `order_number` escrito a mano
  // no puede tumbar el alta de una orden nueva.
  //
  // Los parámetros van con cast explícito: Drizzle los envía como bind y
  // Postgres no siempre puede inferir el tipo de un parámetro suelto en `||`
  // o en los argumentos de lpad/substr.
  return sql<string>`(
    ${prefix}::text || lpad(
      (COALESCE((
        SELECT MAX(CAST(substr(${equipment.orderNumber}, ${suffixStart}::int) AS INTEGER))
        FROM ${equipment}
        WHERE ${equipment.orderNumber} LIKE ${monthlyPattern}
          AND substr(${equipment.orderNumber}, ${suffixStart}::int) ~ '^[0-9]+$'
      ), 0) + 1)::text,
      ${ORDER_SEQUENCE_WIDTH}::int,
      '0'
    )
  )`;
}

export async function listEquipment({ search, status, limit, offset, cursor }: EquipmentListQuery) {
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
    const listCondition = and(statusCondition, searchCondition);

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
    const [pageRows, [matching], statusRows, [revenue]] = await Promise.all([
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
        .groupBy(equipment.status),
      db
        .select({
          monthRevenueCents: sql<number>`COALESCE(SUM(${equipment.invoiceTotalCents}), 0)`,
        })
        .from(equipment)
        .where(like(equipment.exitDate, monthPrefix)),
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

export async function createEquipment(values: NewEquipmentInput, prefix: string) {
    const db = getDb();
    const insertValues = { ...values, orderNumber: monthlyOrderNumber(prefix) };
    let row: typeof equipment.$inferSelect | undefined;
    let lastUniqueError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        [row] = await db.insert(equipment).values(insertValues).returning();
        break;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        lastUniqueError = error;
      }
    }

    if (!row) throw lastUniqueError || new Error("No se pudo generar el número de orden.");

    return row;
}

export async function updateEquipment(id: number, payload: Record<string, unknown>) {
    const db = getDb();
    // La lectura, el cálculo de la instantánea y la escritura comparten el
    // mismo bloqueo de fila. Dos pestañas que corrijan costos parciales ya no
    // pueden calcular la factura contra el mismo estado antiguo y luego pisarse.
    const row = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: equipment.id,
          status: equipment.status,
          exitDate: equipment.exitDate,
          invoiceNumber: equipment.invoiceNumber,
          partsCostCents: equipment.partsCostCents,
          laborCostCents: equipment.laborCostCents,
          invoiceTaxCents: equipment.invoiceTaxCents,
          invoiceTaxRate: equipment.invoiceTaxRate,
        })
        .from(equipment)
        .where(eq(equipment.id, id))
        .limit(1)
        .for("update");
      if (!current) return null;

      const values = buildEquipmentUpdate(current, payload);
      const [updated] = await tx
        .update(equipment)
        .set(values)
        .where(eq(equipment.id, id))
        .returning();
      return updated ?? null;
    });
    return row;
}
