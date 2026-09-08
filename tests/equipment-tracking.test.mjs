import test from "node:test";
import assert from "node:assert/strict";
import { expectedVersion, EquipmentConflictError, parseWarrantyDays, parseEstimatedExitDate, parseHistoryNote, workshopDays } from "../lib/equipment-tracking.ts";
import { parseEquipmentListQuery } from "../lib/equipment-query.ts";
import { buildEquipmentUpdate } from "../lib/equipment-update.ts";

test("ediciones requieren una versión numérica positiva y acotada", () => {
  for (const value of [undefined, null, "1", 0, -1, 1.5, true, [], 2147483647]) assert.throws(() => expectedVersion(value), EquipmentConflictError);
  assert.equal(expectedVersion(1), 1);
});
test("garantía conserva cero días y rechaza fracciones, vacíos y valores fuera de rango", () => {
  assert.equal(parseWarrantyDays(0), 0);
  assert.equal(parseWarrantyDays("30"), 30);
  assert.equal(parseWarrantyDays(3650), 3650);
  for (const value of ["", null, true, [], 1.5, -1, 3651, "1e2"]) assert.throws(() => parseWarrantyDays(value));
});
test("entrega estimada opcional, fecha real y posterior o igual al ingreso", () => {
  assert.equal(parseEstimatedExitDate("", "2026-09-07"), null);
  assert.equal(parseEstimatedExitDate("2026-09-07", "2026-09-07"), "2026-09-07");
  for (const value of ["2026-02-30", "2026-09-06", true]) assert.throws(() => parseEstimatedExitDate(value, "2026-09-07"));
});
test("corregir ingreso valida el plazo guardado y permite borrar la fecha estimada", () => {
  const current = { id: 1, status: "ingreso", entryDate: "2026-09-01", estimatedExitDate: "2026-09-07", exitDate: null, invoiceNumber: null, partsCostCents: 0, laborCostCents: 0, invoiceTaxCents: null, invoiceTaxRate: null };
  assert.throws(() => buildEquipmentUpdate(current, { entryDate: "2026-09-08" }));
  assert.equal(buildEquipmentUpdate(current, { entryDate: "2026-09-08", estimatedExitDate: null }).estimatedExitDate, null);
  const updated = buildEquipmentUpdate(current, { serialNumber: " IMEI-123 ", warrantyDays: 90 });
  assert.equal(updated.serialNumber, "IMEI-123"); assert.equal(updated.warrantyDays, 90);
});
test("filtros de técnico y fechas se validan incluso en páginas siguientes", () => {
  const query = parseEquipmentListQuery(new URLSearchParams("technician=Ana&entryFrom=2026-09-01&entryTo=2026-09-07&cursor=10"));
  assert.equal(query.technician, "Ana"); assert.equal(query.entryFrom, "2026-09-01"); assert.equal(query.cursor.id, 10);
  for (const params of ["entryFrom=2026-02-30", "entryFrom=2026-09-08&entryTo=2026-09-07", "technician=A&technician=B", "entryTo=2026-09-07&entryTo=2026-09-07"]) assert.throws(() => parseEquipmentListQuery(new URLSearchParams(params)));
});
test("notas no vacías y días en taller por fecha de calendario", () => {
  assert.equal(parseHistoryNote(" Llamó el cliente "), "Llamó el cliente");
  for (const value of [" ", null, {}, "a".repeat(2001)]) assert.throws(() => parseHistoryNote(value));
  assert.equal(workshopDays("2026-09-01", "2026-09-07"), 6);
  assert.equal(workshopDays("2026-09-01", "2026-09-07", "2026-09-04"), 3);
  assert.equal(workshopDays("2026-09-08", "2026-09-07"), 0);
  assert.equal(workshopDays("2024-02-28", "2024-03-01"), 2);
});
