import assert from "node:assert/strict";
import test from "node:test";
import { todayInPanama } from "../lib/panama-date.ts";
import { buildEquipmentUpdate } from "../lib/equipment-update.ts";

test("la fecha del taller sigue a Panamá, no a UTC", () => {
  // 2026-08-14T02:30:00Z son las 21:30 del 13 de agosto en Panamá (UTC-5).
  // Tomar la fecha de UTC adelantaría el día.
  assert.equal(todayInPanama(new Date("2026-08-14T02:30:00Z")), "2026-08-13");
  assert.equal(todayInPanama(new Date("2026-08-13T04:59:59Z")), "2026-08-12");
  assert.equal(todayInPanama(new Date("2026-08-13T05:00:00Z")), "2026-08-13");
  assert.match(todayInPanama(), /^\d{4}-\d{2}-\d{2}$/);
});

test("una salida sin fecha explícita usa el día de Panamá", () => {
  const values = buildEquipmentUpdate(
    {
      id: 7,
      status: "listo",
      exitDate: null,
      invoiceNumber: null,
      partsCostCents: 0,
      laborCostCents: 0,
    },
    { status: "entregado" },
  );

  assert.equal(values.exitDate, todayInPanama());
});
