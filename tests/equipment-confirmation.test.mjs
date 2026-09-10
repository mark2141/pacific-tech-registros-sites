import assert from "node:assert/strict";
import test from "node:test";
import { equipmentChangeConfirmation } from "../lib/equipment-confirmation.ts";
const order = { orderNumber: "OT-202609-001", status: "listo", partsCostCents: 0, laborCostCents: 0 };

test("entregar desde cualquier acción usa los costos del borrador y avisa si son cero", () => {
  assert.match(equipmentChangeConfirmation(order, { status: "entregado" }), /no tiene mano de obra/);
  const message = equipmentChangeConfirmation(order, { status: "entregado", laborCostCents: 2500 });
  assert.match(message, /25[.,]00/);
  assert.doesNotMatch(message, /no tiene mano de obra/);
});
test("anular y reabrir una entrega explican que se retira la factura", () => {
  const delivered = { ...order, status: "entregado" };
  assert.match(equipmentChangeConfirmation(delivered, { status: "anulado" }), /factura/);
  assert.match(equipmentChangeConfirmation(delivered, { status: "reparacion" }), /factura/);
  assert.match(equipmentChangeConfirmation(delivered, { laborCostCents: 100 }), /corrección/);
});
test("editar notas o conservar el estado no pide una confirmación innecesaria", () => {
  assert.equal(equipmentChangeConfirmation(order, { notes: "Llamada" }), null);
  assert.equal(equipmentChangeConfirmation(order, { status: "listo" }), null);
});
