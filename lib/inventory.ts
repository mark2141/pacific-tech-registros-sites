export type InventoryItem = { id: number; sku: string; name: string; supplier: string; unitCostCents: number; stock: number; minimumStock: number; version: number };
export type InventoryMovement = { id: number; operationId: string; itemId: number; equipmentId: number | null; sourceMovementId: number | null; kind: string; quantity: number; unitCostCents: number; stockAfter: number; note: string; actorUserId: string; actorEmail: string; createdAt: string };
export type OrderPart = { id: number; itemId: number; sku: string; name: string; quantity: number; returned: number; unitCostCents: number };
export type InventoryMetadata = Pick<InventoryItem, "sku" | "name" | "supplier" | "unitCostCents" | "minimumStock">;
export const MAX_STOCK = 1_000_000;
export class InventoryError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = "InventoryError"; this.status = status; }
}
export function inventoryInteger(value: unknown, label: string, min = 0, max = MAX_STOCK) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new InventoryError(`${label} debe ser un entero entre ${min} y ${max}.`);
  return value;
}
function textField(value: unknown, label: string, max: number, required = true) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new InventoryError(`${label}: ${required ? "completa este campo con " : "usa "}hasta ${max} caracteres.`);
  return value.trim();
}
export function inventoryMetadata(payload: Record<string, unknown>): InventoryMetadata {
  const sku = textField(payload.sku, "Código", 60).toUpperCase();
  if (!/^[A-Z0-9._-]+$/.test(sku)) throw new InventoryError("El código admite letras sin acentos, números, puntos, guiones y guion bajo.");
  return { sku, name: textField(payload.name, "Nombre", 120), supplier: textField(payload.supplier, "Proveedor", 120, false),
    unitCostCents: inventoryInteger(payload.unitCostCents, "Costo", 0, 2_147_483_647), minimumStock: inventoryInteger(payload.minimumStock, "Stock mínimo") };
}
export function inventoryId(value: unknown) { return inventoryInteger(value, "Identificador", 1, 2_147_483_647); }
export function inventoryParamId(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  if (!values.length) return undefined;
  if (values.length !== 1 || !/^\d+$/.test(values[0])) throw new InventoryError("Identificador inválido.");
  return inventoryId(Number(values[0]));
}
export type InventoryQuery = { search: string; lowOnly: boolean; before?: number };
export function inventoryQuery(params: URLSearchParams): InventoryQuery {
  for (const name of ["search", "low", "before"]) if (params.getAll(name).length > 1) throw new InventoryError("Filtros duplicados.");
  const search = params.get("search")?.trim() || "";
  if (search.length > 120 || (params.has("low") && !["0", "1"].includes(params.get("low")!))) throw new InventoryError("Filtros de inventario inválidos.");
  const raw = params.get("before");
  if (raw !== null && !/^\d+$/.test(raw)) throw new InventoryError("Página inválida.");
  return { search, lowOnly: params.get("low") === "1", before: raw === null ? undefined : inventoryId(Number(raw)) };
}
export type MovementInput = { operationId: string; itemId: number; version: number; kind: "entrada" | "salida" | "consumo" | "devolucion"; quantity: number; equipmentId: number | null; sourceMovementId: number | null; note: string };
export function movementInput(payload: Record<string, unknown>): MovementInput {
  if (typeof payload.operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.operationId)) throw new InventoryError("La operación necesita un identificador válido.");
  const kind = payload.kind;
  if (kind !== "entrada" && kind !== "salida" && kind !== "consumo" && kind !== "devolucion") throw new InventoryError("Movimiento inválido.");
  const forOrder = kind === "consumo" || kind === "devolucion";
  if (!forOrder && (payload.equipmentId != null || payload.sourceMovementId != null)) throw new InventoryError("Usa el movimiento de orden para asociar un repuesto.");
  return { operationId: payload.operationId, kind, itemId: inventoryId(payload.itemId), version: inventoryId(payload.version),
    quantity: inventoryInteger(payload.quantity, "Cantidad", 1), note: textField(payload.note, "Motivo", 500),
    equipmentId: forOrder ? inventoryId(payload.equipmentId) : null,
    sourceMovementId: kind === "devolucion" ? inventoryId(payload.sourceMovementId) : null };
}
export function movementDelta(input: MovementInput) { return (input.kind === "salida" || input.kind === "consumo" ? -1 : 1) * input.quantity; }
export function verifyReplay(event: Pick<InventoryMovement, "actorUserId" | "itemId" | "equipmentId" | "sourceMovementId" | "kind" | "quantity" | "note">, input: MovementInput, actorId: string) {
  if (event.actorUserId !== actorId || event.itemId !== input.itemId || event.equipmentId !== input.equipmentId || event.sourceMovementId !== input.sourceMovementId || event.kind !== input.kind || event.quantity !== movementDelta(input) || event.note !== input.note) throw new InventoryError("Este identificador ya se usó para otro movimiento.", 409);
}
export function validateStock(item: InventoryItem, input: MovementInput) {
  if (item.version !== input.version) throw new InventoryError("El repuesto cambió en otra sesión. Recarga sus datos antes de continuar.", 409);
  const after = item.stock + movementDelta(input);
  if (after < 0) throw new InventoryError("No hay existencias suficientes para esa cantidad.", 409);
  if (after > MAX_STOCK) throw new InventoryError("El stock no puede superar 1,000,000 unidades.");
  return after;
}
