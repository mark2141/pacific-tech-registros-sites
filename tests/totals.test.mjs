import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTotals,
  dollarsToCents,
  formatDate,
  formatMoney,
} from "../lib/totals.ts";

test("suma piezas y mano de obra, sin impuesto", () => {
  // El ITBMS del 7 % se retiró: el total es el subtotal, y ningún importe
  // pasa por un redondeo que antes podía desviar un centavo.
  assert.deepEqual(calculateTotals(1_999, 0), {
    subtotalCents: 1_999,
    totalCents: 1_999,
  });
  assert.deepEqual(calculateTotals(10_000, 5_000), {
    subtotalCents: 15_000,
    totalCents: 15_000,
  });
});

test("acepta piezas o mano de obra en cero", () => {
  assert.deepEqual(calculateTotals(0, 2_500), {
    subtotalCents: 2_500,
    totalCents: 2_500,
  });
  assert.deepEqual(calculateTotals(4_000, 0), {
    subtotalCents: 4_000,
    totalCents: 4_000,
  });
});

test("normaliza valores no numéricos o negativos a cero", () => {
  assert.deepEqual(calculateTotals("no-numérico", -15), {
    subtotalCents: 0,
    totalCents: 0,
  });
  assert.equal(formatMoney("no-numérico"), formatMoney(0));
});

test("convierte dólares válidos a centavos sin silenciar errores", () => {
  assert.equal(dollarsToCents("19.99"), 1_999);
  assert.equal(dollarsToCents(""), 0);
  assert.equal(dollarsToCents("12.345"), null);
  assert.equal(dollarsToCents("precio"), null);
});

test("formatDate maneja null y conserva el día ISO en UTC", () => {
  assert.equal(formatDate(null), "-");

  const formatted = formatDate("2026-08-08T00:00:00.000Z");
  assert.match(formatted, /08/);
  assert.match(formatted, /2026/);
  assert.doesNotMatch(formatted, /07/);
  assert.equal(formatDate("2026-02-30"), "-");
});
