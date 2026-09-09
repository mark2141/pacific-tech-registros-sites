import { and, count, desc, eq, ilike, lt, lte, or, sql } from "drizzle-orm";
import { canAccessOrder } from "../../lib/permissions";
import { getDb } from "../../db";
import { equipment, equipmentHistory, inventoryItems as items, inventoryMovements as movements } from "../../db/schema";
import { escapeLikePattern } from "../../lib/equipment-query";
import { InventoryError, movementDelta, validateStock, verifyReplay, type InventoryMetadata, type InventoryQuery, type MovementInput, type OrderPart } from "../../lib/inventory";
import type { EquipmentActor } from "../../lib/equipment-repository";

const eventFrom = (event: typeof movements.$inferSelect) => ({ ...event, createdAt: event.createdAt.toISOString() });
export async function getInventoryItem(id: number) {
  const [item] = await getDb().select().from(items).where(eq(items.id, id)).limit(1);
  return item ?? null;
}
export async function listInventory(query: InventoryQuery) {
  const pattern = `%${escapeLikePattern(query.search)}%`;
  const condition = and(query.search ? or(ilike(items.sku, pattern), ilike(items.name, pattern), ilike(items.supplier, pattern)) : undefined, query.lowOnly ? lte(items.stock, items.minimumStock) : undefined);
  const [rows, [matching], [summary]] = await Promise.all([
    getDb().select().from(items).where(and(condition, query.before ? lt(items.id, query.before) : undefined)).orderBy(desc(items.id)).limit(51),
    getDb().select({ total: count() }).from(items).where(condition),
    getDb().select({ total: count(), lowStock: sql<number>`count(*) filter (where ${items.stock} <= ${items.minimumStock})`, outOfStock: sql<number>`count(*) filter (where ${items.stock} = 0)` }).from(items),
  ]);
  const selected = rows.slice(0, 50);
  return { items: selected, total: Number(matching.total), nextCursor: rows.length > 50 ? selected.at(-1)!.id : null,
    summary: { total: Number(summary.total), lowStock: Number(summary.lowStock), outOfStock: Number(summary.outOfStock) } };
}
export async function createInventoryItem(values: InventoryMetadata, stock: number, actor: EquipmentActor) {
  return getDb().transaction(async tx => {
    const [item] = await tx.insert(items).values({ ...values, stock }).returning();
    if (stock) await tx.insert(movements).values({ operationId: crypto.randomUUID(), itemId: item.id, kind: "entrada", quantity: stock,
      unitCostCents: item.unitCostCents, stockAfter: stock, note: "Existencias iniciales", actorUserId: actor.userId, actorEmail: actor.email });
    return item;
  });
}
export async function editInventoryItem(id: number, version: number, values: InventoryMetadata) {
  const [item] = await getDb().update(items).set({ ...values, version: version + 1 }).where(and(eq(items.id, id), eq(items.version, version))).returning();
  if (!item) throw new InventoryError("El repuesto cambió o ya no está disponible. Recarga sus datos.", 409);
  return item;
}
export async function listInventoryMovements(itemId: number, before?: number) {
  const rows = await getDb().select().from(movements).where(and(eq(movements.itemId, itemId), before ? lt(movements.id, before) : undefined)).orderBy(desc(movements.id)).limit(51);
  return { movements: rows.slice(0, 50).map(eventFrom), nextCursor: rows.length > 50 ? rows[49].id : null };
}
export async function listOrderParts(equipmentId: number, before?: number) {
  const rows = await getDb().select({ id: movements.id, itemId: movements.itemId, sku: items.sku, name: items.name,
    quantity: sql<number>`-${movements.quantity}`, unitCostCents: movements.unitCostCents,
    returned: sql<number>`(select coalesce(sum(r.quantity),0) from inventory_movements r where r.source_movement_id = ${movements.id})` })
    .from(movements).innerJoin(items, eq(items.id, movements.itemId))
    .where(and(eq(movements.equipmentId, equipmentId), eq(movements.kind, "consumo"), before ? lt(movements.id, before) : undefined)).orderBy(desc(movements.id)).limit(51);
  return { parts: rows.slice(0, 50).map(row => ({ ...row, quantity: Number(row.quantity), returned: Number(row.returned) })) as OrderPart[], nextCursor: rows.length > 50 ? rows[49].id : null };
}
export async function moveInventory(input: MovementInput, actor: EquipmentActor) {
  return getDb().transaction(async tx => {
    let orderStatus: string | undefined;
    if (input.equipmentId) {
      const [order] = await tx.select().from(equipment).where(eq(equipment.id, input.equipmentId)).for("update");
      if (!order||!canAccessOrder(actor,order)) throw new InventoryError("No se encontró la orden.", 404);
      orderStatus = order.status;
    }
    const [item] = await tx.select().from(items).where(eq(items.id, input.itemId)).for("update");
    if (!item) throw new InventoryError("No se encontró el repuesto.", 404);
    const [prior] = await tx.select().from(movements).where(eq(movements.operationId, input.operationId));
    if (prior) { verifyReplay(prior, input, actor.userId); return { item, movement: eventFrom(prior), replayed: true }; }
    if (input.kind === "consumo" && orderStatus && ["entregado", "anulado"].includes(orderStatus)) throw new InventoryError("La orden está cerrada. Reábrela para asociar repuestos.", 409);
    const stockAfter = validateStock(item, input);
    let unitCostCents = item.unitCostCents;
    if (input.sourceMovementId) {
      const [source] = await tx.select().from(movements).where(eq(movements.id, input.sourceMovementId));
      const [returns] = await tx.select({ quantity: sql<number>`coalesce(sum(${movements.quantity}),0)` }).from(movements).where(eq(movements.sourceMovementId, input.sourceMovementId));
      if (!source || source.kind !== "consumo" || source.itemId !== item.id || source.equipmentId !== input.equipmentId || input.quantity > -source.quantity - Number(returns.quantity)) throw new InventoryError("La devolución supera las unidades usadas o no corresponde a esta orden.", 409);
      unitCostCents = source.unitCostCents;
    }
    const [updated] = await tx.update(items).set({ stock: stockAfter, version: item.version + 1 }).where(eq(items.id, item.id)).returning();
    const [event] = await tx.insert(movements).values({ operationId: input.operationId, itemId: input.itemId, equipmentId: input.equipmentId,
      sourceMovementId: input.sourceMovementId, kind: input.kind, note: input.note, quantity: movementDelta(input), unitCostCents, stockAfter, actorUserId: actor.userId, actorEmail: actor.email }).returning();
    if (input.equipmentId) await tx.insert(equipmentHistory).values({ equipmentId: input.equipmentId, kind: "repuesto",
      message: `${input.kind === "consumo" ? "Repuesto utilizado" : "Repuesto devuelto"}: ${item.sku} · ${item.name} · ${input.quantity} unidades. ${input.note}`, actorUserId: actor.userId, actorEmail: actor.email });
    return { item: updated, movement: eventFrom(event), replayed: false };
  });
}
