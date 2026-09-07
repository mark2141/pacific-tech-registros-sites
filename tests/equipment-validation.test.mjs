import assert from "node:assert/strict";
import test from "node:test";
import { readEquipmentPayload, validateEquipmentTextFields, InvalidEquipmentPayloadError } from "../lib/equipment-validation.ts";
import { parseOptionalCents, MAX_MONEY_CENTS, InvalidMoneyValueError } from "../lib/equipment-values.ts";
import { buildEquipmentUpdate } from "../lib/equipment-update.ts";

const current = { id: 1, status: "listo", exitDate: null, invoiceNumber: null, partsCostCents: 0, laborCostCents: 0, invoiceTaxCents: null, invoiceTaxRate: null };

test("rechaza JSON roto, null, listas y valores escalares como registro", async () => {
  for (const body of ["{", "null", "[]", "true", '"texto"']) {
    await assert.rejects(readEquipmentPayload(new Request("https://local.test", { method: "POST", body })), InvalidEquipmentPayloadError);
  }
});
test("admite el límite de texto y rechaza longitudes excesivas y tipos incorrectos", () => {
  validateEquipmentTextFields({ customerName: "a".repeat(120), diagnosis: "b".repeat(4000) });
  for (const values of [{ customerName: "a".repeat(121) }, { diagnosis: "b".repeat(4001) }, { notes: {} }, { status: true }]) {
    assert.throws(() => validateEquipmentTextFields(values), InvalidEquipmentPayloadError);
    assert.throws(() => buildEquipmentUpdate(current, values), InvalidEquipmentPayloadError);
  }
});
test("centavos rechazan booleanos, listas, exponentes, fracciones y desbordamientos", () => {
  for (const value of [true, false, [], [100], {}, " ", "1e3", "1.5", -1, 1.5, MAX_MONEY_CENTS + 1]) {
    assert.throws(() => parseOptionalCents(value, "piezas"), InvalidMoneyValueError);
  }
  assert.equal(parseOptionalCents("1999", "piezas"), 1999);
  assert.equal(parseOptionalCents(MAX_MONEY_CENTS, "piezas"), MAX_MONEY_CENTS);
});
test("el total y el impuesto histórico tampoco pueden desbordar la base", () => {
  assert.throws(() => buildEquipmentUpdate(current, { partsCostCents: MAX_MONEY_CENTS, laborCostCents: 1 }), InvalidMoneyValueError);
  assert.throws(() => buildEquipmentUpdate({ ...current, status: "entregado", invoiceTaxRate: 0.07 }, { partsCostCents: MAX_MONEY_CENTS }), InvalidMoneyValueError);
  assert.equal(buildEquipmentUpdate(current, { status: "entregado", partsCostCents: MAX_MONEY_CENTS }).invoiceTotalCents, MAX_MONEY_CENTS);
});
