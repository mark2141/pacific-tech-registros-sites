import { getSitesDb } from "./database";
import { escapeLikePattern } from "../../lib/equipment-query";
import { InventoryError, movementDelta, validateStock, verifyReplay, type InventoryItem, type InventoryMetadata, type InventoryMovement, type InventoryQuery, type MovementInput, type OrderPart } from "../../lib/inventory";
import type { EquipmentActor } from "../../lib/equipment-repository";

const itemSelection = `id, sku, name, supplier, unit_cost_cents AS "unitCostCents", stock, minimum_stock AS "minimumStock", version`;
const movementSelection = `id, operation_id AS "operationId", item_id AS "itemId", equipment_id AS "equipmentId", source_movement_id AS "sourceMovementId", kind, quantity, unit_cost_cents AS "unitCostCents", stock_after AS "stockAfter", note, actor_user_id AS "actorUserId", actor_email AS "actorEmail", created_at AS "createdAt"`;
export async function getInventoryItem(id: number) { return getSitesDb().prepare(`SELECT ${itemSelection} FROM inventory_items WHERE id = ?`).bind(id).first<InventoryItem>(); }
export async function listInventory(query: InventoryQuery) {
  const db = getSitesDb(); const conditions = ["1 = 1"]; const values: (string | number)[] = [];
  if (query.search) { conditions.push("(sku LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR supplier LIKE ? ESCAPE '\\')"); values.push(...Array(3).fill(`%${escapeLikePattern(query.search)}%`)); }
  if (query.lowOnly) conditions.push("stock <= minimum_stock");
  const where = conditions.join(" AND ");
  const results = await db.batch([
    db.prepare(`SELECT ${itemSelection} FROM inventory_items WHERE ${where}${query.before ? " AND id < ?" : ""} ORDER BY id DESC LIMIT 51`).bind(...values, ...(query.before ? [query.before] : [])),
    db.prepare(`SELECT COUNT(*) AS total FROM inventory_items WHERE ${where}`).bind(...values),
    db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(stock <= minimum_stock),0) AS lowStock, COALESCE(SUM(stock = 0),0) AS outOfStock FROM inventory_items`),
  ]);
  const rows = results[0].results as InventoryItem[];
  return { items: rows.slice(0, 50), total: Number((results[1].results[0] as { total: number }).total), nextCursor: rows.length > 50 ? rows[49].id : null,
    summary: results[2].results[0] as { total: number; lowStock: number; outOfStock: number } };
}
export async function createInventoryItem(values: InventoryMetadata, stock: number, actor: EquipmentActor) {
  const db = getSitesDb();
  const statements = [db.prepare(`INSERT INTO inventory_items (sku,name,supplier,unit_cost_cents,minimum_stock,stock) VALUES (?,?,?,?,?,?) RETURNING ${itemSelection}`)
    .bind(values.sku, values.name, values.supplier, values.unitCostCents, values.minimumStock, stock)];
  if (stock) statements.push(db.prepare(`INSERT INTO inventory_movements (operation_id,item_id,kind,quantity,unit_cost_cents,stock_after,note,actor_user_id,actor_email,created_at)
    VALUES (?,last_insert_rowid(),'entrada',?,?,?,'Existencias iniciales',?,?,?)`).bind(crypto.randomUUID(), stock, values.unitCostCents, stock, actor.userId, actor.email, new Date().toISOString()));
  const results = await db.batch(statements); return results[0].results[0] as InventoryItem;
}
export async function editInventoryItem(id: number, version: number, values: InventoryMetadata) {
  const item = await getSitesDb().prepare(`UPDATE inventory_items SET sku=?,name=?,supplier=?,unit_cost_cents=?,minimum_stock=?,version=version+1 WHERE id=? AND version=? RETURNING ${itemSelection}`)
    .bind(values.sku, values.name, values.supplier, values.unitCostCents, values.minimumStock, id, version).first<InventoryItem>();
  if (!item) throw new InventoryError("El repuesto cambió o ya no está disponible. Recarga sus datos.", 409);
  return item;
}
export async function listInventoryMovements(itemId: number, before?: number) {
  const rows = (await getSitesDb().prepare(`SELECT ${movementSelection} FROM inventory_movements WHERE item_id=?${before ? " AND id<?" : ""} ORDER BY id DESC LIMIT 51`).bind(itemId, ...(before ? [before] : [])).all<InventoryMovement>()).results;
  return { movements: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
}
export async function listOrderParts(equipmentId: number, before?: number) {
  const rows = (await getSitesDb().prepare(`SELECT m.id, m.item_id AS itemId, i.sku, i.name, -m.quantity AS quantity, m.unit_cost_cents AS unitCostCents,
    (SELECT COALESCE(SUM(r.quantity),0) FROM inventory_movements r WHERE r.source_movement_id=m.id) AS returned
    FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id WHERE m.equipment_id=? AND m.kind='consumo'${before ? " AND m.id<?" : ""} ORDER BY m.id DESC LIMIT 51`).bind(equipmentId, ...(before ? [before] : [])).all<OrderPart>()).results;
  return { parts: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
}
export async function moveInventory(input: MovementInput, actor: EquipmentActor) {
  const db = getSitesDb();
  const previous = () => db.prepare(`SELECT ${movementSelection} FROM inventory_movements WHERE operation_id=?`).bind(input.operationId).first<InventoryMovement>();
  const replay = async (event: InventoryMovement) => { verifyReplay(event, input, actor.userId); return { item: (await getInventoryItem(input.itemId))!, movement: event, replayed: true }; };
  const prior = await previous(); if (prior) return replay(prior);
  const item = await getInventoryItem(input.itemId);
  if (!item) throw new InventoryError("No se encontró el repuesto.", 404);
  validateStock(item, input);
  let unitCostCents = item.unitCostCents;
  const conditions = ["id=?", "version=?", "stock + ? BETWEEN 0 AND 1000000"];
  const delta = movementDelta(input);
  const bindings: (string | number)[] = [item.id, input.version, delta];
  if (input.equipmentId) {
    conditions.push(`EXISTS (SELECT 1 FROM equipment WHERE id=?${input.kind === "consumo" ? " AND status NOT IN ('entregado','anulado')" : ""})`); bindings.push(input.equipmentId);
  }
  if(actor.role==="tecnico"){conditions.push("EXISTS (SELECT 1 FROM equipment WHERE id=? AND assigned_member_id=?)");bindings.push(input.equipmentId??-1,actor.memberId??-1);}
  if (input.sourceMovementId) {
    const source = await db.prepare(`SELECT ${movementSelection} FROM inventory_movements WHERE id=?`).bind(input.sourceMovementId).first<InventoryMovement>();
    if (!source || source.kind !== "consumo" || source.itemId !== item.id || source.equipmentId !== input.equipmentId) throw new InventoryError("La devolución no corresponde a un consumo de esta orden.", 409);
    unitCostCents = source.unitCostCents;
    conditions.push("? <= (SELECT -s.quantity - (SELECT COALESCE(SUM(r.quantity),0) FROM inventory_movements r WHERE r.source_movement_id=s.id) FROM inventory_movements s WHERE s.id=?)");
    bindings.push(input.quantity, source.id);
  }
  const statements = [
    db.prepare(`UPDATE inventory_items SET stock=stock+?,version=version+1 WHERE ${conditions.join(" AND ")} RETURNING ${itemSelection}`).bind(delta, ...bindings),
    db.prepare(`INSERT INTO inventory_movements (operation_id,item_id,equipment_id,source_movement_id,kind,quantity,unit_cost_cents,stock_after,note,actor_user_id,actor_email,created_at)
      SELECT ?,id,?,?,?,?,?,stock,?,?,?,? FROM inventory_items WHERE id=? AND changes()=1 RETURNING ${movementSelection}`)
      .bind(input.operationId, input.equipmentId, input.sourceMovementId, input.kind, delta, unitCostCents, input.note, actor.userId, actor.email, new Date().toISOString(), item.id),
  ];
  if (input.equipmentId) statements.push(db.prepare(`INSERT INTO equipment_history (equipment_id,kind,message,actor_user_id,actor_email,created_at)
    SELECT ?,'repuesto',?,?,?,? WHERE changes()=1`).bind(input.equipmentId,
    `${input.kind === "consumo" ? "Repuesto utilizado" : "Repuesto devuelto"}: ${item.sku} · ${item.name} · ${input.quantity} unidades. ${input.note}`, actor.userId, actor.email, new Date().toISOString()));
  // Each write and its audit entries succeed together. A lost CAS inserts nothing.
  try {
    const results = await db.batch(statements);
    const event = results[1].results[0] as InventoryMovement | undefined;
    if (event) return { item: results[0].results[0] as InventoryItem, movement: event, replayed: false };
  } catch (error) { const existing = await previous(); if (existing) return replay(existing); throw error; }
  const existing = await previous(); if (existing) return replay(existing);
  throw new InventoryError("No se aplicó el movimiento: cambió el stock, la orden está cerrada o la devolución supera lo utilizado. Recarga los datos.", 409);
}
