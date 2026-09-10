import test from "node:test";
import assert from "node:assert/strict";
import { can, canEditPayload, resolveRole } from "../lib/permissions.ts";
import { paymentInput, paymentAmount, assertPaymentReplay, balance, protectPaidOrder } from "../lib/payments.ts";
const user = { userId: "verified", email: "OWNER@example.test" };
test("Roles: configuración confiable, inválidos y ausentes sin activación automática", () => {
  for (const config of [undefined, "{", "[]", '{"owner@example.test":"root"}']) assert.equal(resolveRole(user, config), null);
  assert.equal(resolveRole(user, '{"owner@example.test":"admin"}'), "admin");
  assert.equal(resolveRole(user, '{"verified":"tecnico","owner@example.test":"admin"}'), "tecnico");
  assert.equal(resolveRole({ userId: "constructor", email: "toString" }, '{}'), null);
  for (const permission of ["receive", "edit", "charge", "reverse", "stock", "consume", "note"]) assert.equal(can("lectura", permission), false);
  assert.equal(can("recepcion", "charge"), false); assert.equal(can("recepcion", "reverse"), false);
  assert.equal(can("tecnico", "stock"), false); assert.equal(can("tecnico", "consume"), true);
});
test("Técnico: permite mano de obra propia, rechaza costos de piezas, entrega y reapertura", () => {
  assert.equal(canEditPayload("tecnico", { id: 1, version: 1, diagnosis: "Listo", status: "listo" }, "reparacion"), true);
  assert.equal(canEditPayload("tecnico",{laborCostCents:2500},"reparacion"),true);
  for (const payload of [{ status: "entregado" }, { status: "anulado" }, { partsCostCents: 0 }, { paidCents: 0 }, { assignedTechnician: "otro" }]) assert.equal(canEditPayload("tecnico", payload, "ingreso"), false);
  assert.equal(canEditPayload("tecnico", { status: "ingreso" }, "entregado"), false);
});
const order = { status: "ingreso", partsCostCents: 700, laborCostCents: 300, invoiceTotalCents: null, paidCents: 400 };
const valid = { equipmentId: 1, version: 1, operationId: "d8eeea1f-6e57-4410-84d8-b1bb2075c772", amountCents: 600, method: "efectivo", note: "Abono", reference: "", reversalOf: null };
test("Pagos: centavos, métodos, importes y referencias estrictos", () => {
  assert.deepEqual(paymentInput(valid), valid);
  for (const amountCents of [0, -1, 1.1, "100", NaN, 2147483648]) assert.throws(() => paymentInput({ ...valid, amountCents }));
  for (const patch of [{ method: "constructor" }, { note: "" }, { reference: "x".repeat(121) }, { operationId: "x" }, { equipmentId: true }]) assert.throws(() => paymentInput({ ...valid, ...patch }));
});
test("Saldos: abonos estimados, factura histórica y protección de pagos", () => {
  assert.equal(balance(order).dueCents, 600); assert.equal(balance(order).label, "Pago parcial");
  assert.equal(paymentAmount(order, valid), 600);
  assert.throws(() => paymentAmount(order, { ...valid, amountCents: 601 }));
  assert.throws(() => paymentAmount({ ...order, status: "anulado" }, valid));
  assert.equal(balance({ ...order, status: "entregado", invoiceTotalCents: 1070 }).dueCents, 670);
  for (const patch of [{ status: "anulado" }, { laborCostCents: 0, partsCostCents: 399 }]) assert.throws(() => protectPaidOrder(order, patch));
  assert.throws(() => protectPaidOrder({ ...order, status: "entregado" }, { status: "ingreso" }));
  assert.doesNotThrow(() => protectPaidOrder(order, { laborCostCents: 700 }));
});
test("Anulaciones: originales correctos, una sola vez y reintentos vinculados al autor", () => {
  const input = paymentInput({ ...valid, reversalOf: 4 });
  const original = { equipmentId: 1, amountCents: 400, reversed: false };
  assert.equal(paymentAmount(order, input, original), -400);
  for (const patch of [{ reversed: true }, { equipmentId: 2 }, { amountCents: -100 }]) assert.throws(() => paymentAmount(order, input, { ...original, ...patch }));
  assert.throws(() => paymentAmount(order, input, null));
  const row = { ...valid, actorUserId: "a" };
  assert.doesNotThrow(() => assertPaymentReplay(row, valid, "a"));
  assert.throws(() => assertPaymentReplay(row, valid, "b"));
  assert.throws(() => assertPaymentReplay(row, { ...valid, amountCents: 599 }, "a"));
});
