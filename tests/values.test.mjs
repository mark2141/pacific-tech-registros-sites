import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidEquipmentDateError,
  InvalidMoneyValueError,
  isValidIsoDate,
  parseOptionalCents,
  parseOptionalIsoDate,
} from "../lib/equipment-values.ts";

test("valida fechas YYYY-MM-DD y rechaza días inexistentes", () => {
  assert.equal(isValidIsoDate("2024-02-29"), true);
  assert.equal(isValidIsoDate("2025-02-29"), false);
  assert.equal(isValidIsoDate("2026-13-01"), false);
  assert.equal(isValidIsoDate("01/08/2026"), false);
  assert.equal(parseOptionalIsoDate(undefined, "ingreso"), undefined);
  assert.throws(
    () => parseOptionalIsoDate("2026-02-30", "ingreso"),
    InvalidEquipmentDateError,
  );
});

test("distingue un monto ausente de uno inválido", () => {
  assert.equal(parseOptionalCents(undefined, "piezas"), undefined);
  assert.equal(parseOptionalCents(null, "piezas"), undefined);
  assert.equal(parseOptionalCents(0, "piezas"), 0);
  assert.equal(parseOptionalCents(1_999, "piezas"), 1_999);
  assert.throws(
    () => parseOptionalCents("no-numérico", "piezas"),
    InvalidMoneyValueError,
  );
  assert.throws(
    () => parseOptionalCents(-1, "piezas"),
    InvalidMoneyValueError,
  );
});
