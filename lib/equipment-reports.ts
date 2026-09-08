import { isValidIsoDate } from "./equipment-values.ts";
import { InvalidEquipmentQueryError } from "./equipment-query.ts";
import { workshopDays } from "./equipment-tracking.ts";

export type ReportQuery = { from: string; to: string; technician: string };
export type ReportRow = {
  id: number; orderNumber: string; customerName: string; equipmentType: string;
  assignedTechnician: string; status: string; entryDate: string; exitDate: string | null;
  estimatedExitDate: string | null; invoiceNumber: string | null; invoiceTotalCents: number | null;
  partsCostCents: number; laborCostCents: number;
};
export function parseReportQuery(params: URLSearchParams, today: string): ReportQuery {
  for (const key of ["from", "to", "technician"]) if (params.getAll(key).length > 1) throw new InvalidEquipmentQueryError(`El parámetro ${key} solo puede aparecer una vez.`);
  const from = params.get("from") ?? today.slice(0, 7) + "-01";
  const to = params.get("to") ?? today;
  const technician = params.get("technician")?.trim() ?? "";
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) throw new InvalidEquipmentQueryError("Selecciona un período válido: desde no puede ser posterior a hasta.");
  if (technician.length > 100) throw new InvalidEquipmentQueryError("El técnico admite hasta 100 caracteres.");
  return { from, to, technician };
}

export const activeStatuses = new Set(["ingreso", "diagnostico", "reparacion", "listo"]);
export function createReport(query: ReportQuery, asOf: string) {
  return { ...query, asOf, active: 0, overdue: 0, ready: 0, received: 0, delivered: 0,
    invoicedCents: 0, turnaroundDaysSum: 0, turnaroundCount: 0,
    byTechnician: new Map<string, { technician: string; active: number; overdue: number; delivered: number; invoicedCents: number }>() };
}
export function accumulateReport(report: ReturnType<typeof createReport>, row: ReportRow) {
  const active = activeStatuses.has(row.status);
  const delivered = row.status === "entregado" && Boolean(row.exitDate && row.exitDate >= report.from && row.exitDate <= report.to);
  if (row.status !== "anulado" && row.entryDate >= report.from && row.entryDate <= report.to) report.received++;
  const overdue = active && Boolean(row.estimatedExitDate && row.estimatedExitDate < report.asOf);
  report.active += Number(active); report.overdue += Number(overdue); report.ready += Number(row.status === "listo");
  if (delivered) {
    report.delivered++; report.invoicedCents += row.invoiceTotalCents ?? 0;
    if (isValidIsoDate(row.entryDate) && row.exitDate && isValidIsoDate(row.exitDate) && row.exitDate >= row.entryDate) {
      report.turnaroundDaysSum += workshopDays(row.entryDate, report.asOf, row.exitDate); report.turnaroundCount++;
    }
  }
  if (active || delivered) {
    const name = row.assignedTechnician || "Sin asignar";
    const technician = report.byTechnician.get(name) ?? { technician: name, active: 0, overdue: 0, delivered: 0, invoicedCents: 0 };
    technician.active += Number(active); technician.overdue += Number(overdue);
    technician.delivered += Number(delivered); technician.invoicedCents += delivered ? row.invoiceTotalCents ?? 0 : 0;
    report.byTechnician.set(name, technician);
  }
}
export function finishReport(report: ReturnType<typeof createReport>) {
  const { turnaroundDaysSum, turnaroundCount, byTechnician, ...summary } = report;
  return { ...summary, averageTurnaroundDays: turnaroundCount ? Math.round(turnaroundDaysSum / turnaroundCount * 10) / 10 : null,
    turnaroundCount, byTechnician: [...byTechnician.values()].sort((a, b) => b.active - a.active || a.technician.localeCompare(b.technician, "es")) };
}
export type EquipmentReport = ReturnType<typeof finishReport>;

/** Quote CSV and neutralize spreadsheet formulas in user-entered fields. */
export function csvCell(value: string | number | null) {
  if (typeof value === "number") return String(value);
  const raw = value ?? "";
  // Control bytes and whitespace can precede a formula in spreadsheet readers.
  let start = 0;
  while (start < raw.length && (raw.charCodeAt(start) <= 32 || /\s/u.test(raw[start]))) start++;
  const safe = /^[=+\-@]/.test(raw.slice(start)) || /^[\t\r\n]/.test(raw) ? "'" + raw : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
export const reportCsvHeader = "\uFEFF" + ["Orden", "Cliente", "Equipo", "Técnico", "Estado", "Ingreso", "Entrega estimada", "Salida", "Factura", "Piezas USD", "Mano de obra USD", "Facturado USD"].map(csvCell).join(",") + "\r\n";
export function reportCsvRow(row: ReportRow) {
  return [row.orderNumber, row.customerName, row.equipmentType, row.assignedTechnician, row.status,
    row.entryDate, row.estimatedExitDate, row.exitDate, row.invoiceNumber,
    (row.partsCostCents / 100).toFixed(2), (row.laborCostCents / 100).toFixed(2),
    row.invoiceTotalCents === null ? "" : (row.invoiceTotalCents / 100).toFixed(2)].map(csvCell).join(",") + "\r\n";
}
