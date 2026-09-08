import test from "node:test";
import assert from "node:assert/strict";
import { parseReportQuery, createReport, accumulateReport, finishReport, csvCell, reportCsvRow } from "../lib/equipment-reports.ts";
import { customerMessage, customerEmailHref, whatsappRecipient, whatsappHref, contactEventMessage } from "../lib/customer-message.ts";

test("reporte separa carga actual e ingresos/entregas del período", () => {
  const report = createReport({ from: "2026-09-01", to: "2026-09-07", technician: "" }, "2026-09-07");
  const base = { id: 1, orderNumber: "OT-1", customerName: "Ana", equipmentType: "Laptop", assignedTechnician: "Luis", status: "ingreso", entryDate: "2026-08-01", exitDate: null, estimatedExitDate: "2026-09-06", invoiceNumber: null, invoiceTotalCents: null, partsCostCents: 0, laborCostCents: 0 };
  for (const row of [base, { ...base, id: 2, status: "entregado", entryDate: "2026-08-30", exitDate: "2026-09-02", invoiceTotalCents: 12345 }, { ...base, id: 3, status: "anulado", entryDate: "2026-09-05" }, { ...base, id: 4, status: "listo", entryDate: "2026-09-07", estimatedExitDate: "2026-09-07" }]) accumulateReport(report, row);
  const final = finishReport(report);
  assert.equal(final.active, 2); assert.equal(final.overdue, 1); assert.equal(final.ready, 1);
  assert.equal(final.received, 1); assert.equal(final.delivered, 1); assert.equal(final.invoicedCents, 12345);
  assert.equal(final.averageTurnaroundDays, 3); assert.equal(final.byTechnician[0].active, 2);
  const csv = reportCsvRow({ ...base, customerName: '=HYPERLINK("x")' });
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
});
test("período válido y CSV seguro con comillas, saltos y fórmulas", () => {
  assert.deepEqual(parseReportQuery(new URLSearchParams(), "2026-09-07"), { from: "2026-09-01", to: "2026-09-07", technician: "" });
  for (const text of ["from=2026-02-30", "from=2026-09-08&to=2026-09-07", "from=2026-09-01&from=2026-09-02"]) assert.throws(() => parseReportQuery(new URLSearchParams(text), "2026-09-07"));
  assert.equal(csvCell('Ana, "María"\nPérez'), '"Ana, ""María""\nPérez"');
  for (const text of ["=1+2", " +1", "\t@SUM(A1)", "\u0000-1"]) assert.ok(csvCell(text).startsWith('"\''));
  assert.equal(csvCell(123), "123"); assert.equal(csvCell(null), '""');
});
test("plantillas y enlaces codifican texto sin enviar mensajes automáticamente", () => {
  const record = { customerName: "Ana & Luis", orderNumber: "OT-1", equipmentType: "Laptop", brand: "", model: "", estimatedExitDate: "2026-09-10" };
  const message = customerMessage(record, "Pacific Tech", "recibido");
  assert.match(message, /Ana & Luis/); assert.match(message, /Entrega estimada/);
  assert.equal(whatsappRecipient("6000-0000"), "50760000000");
  assert.equal(whatsappHref("abc", message), null);
  assert.equal(new URL(whatsappHref("50760000000", message)).searchParams.get("text"), message);
  assert.equal(customerEmailHref("invalid", "OT-1", message), null);
  assert.ok(customerEmailHref("cliente@example.com", "OT-1", message).includes("Ana%20%26%20Luis"));
  assert.throws(() => contactEventMessage({ channel: "email", template: ["recibido"], recipient: "a@example.com", message }));
  assert.throws(() => contactEventMessage({ channel: "sms", template: "recibido", recipient: "50760000000", message }));
  assert.match(contactEventMessage({ channel: "whatsapp", template: "recibido", recipient: "50760000000", message }), /WhatsApp · Equipo recibido/);
});
