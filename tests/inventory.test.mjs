import test from "node:test";
import assert from "node:assert/strict";
import { inventoryMetadata, inventoryQuery, inventoryParamId, movementInput, validateStock, verifyReplay, movementDelta } from "../lib/inventory.ts";

const item = { id: 1, sku: "A", name: "Pantalla", supplier: "Proveedor", unitCostCents: 1500, stock: 3, minimumStock: 2, version: 1 };
const input = { operationId: "dfd87bdd-68ad-4e5d-aee4-0386f8419bf5", itemId: 1, version: 1, kind: "consumo", quantity: 2, equipmentId: 5, sourceMovementId: null, note: "Instalación" };
test("catálogo normaliza códigos y valida costos y existencias mínimas", () => {
  assert.equal(inventoryMetadata({ ...item, sku: " pan-1 " }).sku, "PAN-1");
  for (const update of [{ sku: "a b" }, { name: "" }, { supplier: "x".repeat(121) }, { unitCostCents: -1 }, { minimumStock: 1.5 }, { minimumStock: 1000001 }]) assert.throws(() => inventoryMetadata({ ...item, ...update }));
});
test("movimientos requieren cantidad positiva, motivo y una asociación válida", () => {
  assert.equal(movementDelta(movementInput(input)), -2);
  for (const update of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: -1 }, { note: " " }, { equipmentId: null }, { kind: "entrada" }, { operationId: "x" }, { kind: "devolucion", sourceMovementId: null }]) assert.throws(() => movementInput({ ...input, ...update }));
  assert.equal(movementInput({ ...input, kind: "devolucion", sourceMovementId: 3 }).sourceMovementId, 3);
});
test("stock no negativo, versión concurrente y reintentos con el mismo contenido", () => {
  assert.equal(validateStock(item, input), 1);
  assert.throws(() => validateStock(item, { ...input, quantity: 4 }));
  assert.throws(() => validateStock(item, { ...input, version: 2 }));
  assert.throws(() => validateStock({ ...item, stock: 1000000 }, { ...input, kind: "entrada" }));
  const event = { ...input, quantity: -2, actorUserId: "a" };
  assert.doesNotThrow(() => verifyReplay(event, input, "a"));
  assert.throws(() => verifyReplay(event, input, "b"));
  assert.throws(() => verifyReplay(event, { ...input, note: "Otro" }, "a"));
});
test("filtros y paginación rechazan parámetros repetidos o inválidos", () => {
  assert.deepEqual(inventoryQuery(new URLSearchParams("search=Pantalla&low=1&before=4")), { search: "Pantalla", lowOnly: true, before: 4 });
  for (const query of ["low=otro", "before=-1", "before=1&before=2", "search=a&search=b"]) assert.throws(() => inventoryQuery(new URLSearchParams(query)));
  assert.throws(() => inventoryParamId(new URLSearchParams("itemId=1e2"), "itemId"));
});
