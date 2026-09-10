import { parseWarrantyDays, parseEstimatedExitDate } from "./equipment-tracking.ts";
import { validateEquipmentTextFields, InvalidEquipmentPayloadError } from "./equipment-validation.ts";
import { calculateTotals } from "./totals.ts";
import {
  isValidIsoDate,
  MAX_MONEY_CENTS,
  InvalidMoneyValueError,
  parseOptionalCents,
  parseOptionalIsoDate,
} from "./equipment-values.ts";
import {
  parseOptionalCustomerEmail,
  parseOptionalCustomerPhone,
} from "./contact-values.ts";
import { todayInPanama } from "./panama-date.ts";

const allowedStatuses = new Set([
  "ingreso",
  "diagnostico",
  "reparacion",
  "listo",
  "entregado",
  // Una orden creada por error, o un ingreso que el cliente canceló, no se
  // borra: se anula. Borrarla dejaría un hueco en el correlativo del mes y
  // perdería el rastro de que existió.
  "anulado",
]);

export type CurrentEquipmentRow = {
  id: number;
  entryDate?: string;
  estimatedExitDate?: string | null;
  status: string;
  exitDate: string | null;
  invoiceNumber: string | null;
  invoiceKind?: string;
  invoiceTechnician?: string | null;
  assignedTechnician?: string;
  partsCostCents: number;
  laborCostCents: number;
  invoiceTaxCents: number | null;
  invoiceTaxRate: number | null;
};

export class InvalidEquipmentStatusError extends Error {
  constructor(status: string) {
    super(`Estado inválido: ${status}`);
    this.name = "InvalidEquipmentStatusError";
  }
}

/** Un campo obligatorio no puede vaciarse al corregir una orden. */
export class RequiredEquipmentFieldError extends Error {
  constructor(label: string) {
    super(`${label} no puede quedar vacío.`);
    this.name = "RequiredEquipmentFieldError";
  }
}

/** Obligatorios en la base: se pueden corregir, pero no vaciar. */
const REQUIRED_TEXT_FIELDS = [
  ["customerName", "El nombre del cliente"],
  ["equipmentType", "El tipo de equipo"],
  ["reportedIssue", "La falla reportada"],
] as const;

const OPTIONAL_TEXT_FIELDS = [
  "serialNumber",
  "brand",
  "model",
  "accessories",
  "damageNotes",
] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validHistoricalTaxRate(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;
}

function validHistoricalTaxCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function buildEquipmentUpdate(
  current: CurrentEquipmentRow,
  payload: Record<string, unknown>,
) {
  validateEquipmentTextFields(payload);
  if(current.status==="entregado"&&"assignedTechnician" in payload&&payload.assignedTechnician!==current.assignedTechnician)throw new InvalidEquipmentPayloadError("Reabre la orden antes de cambiar el técnico de una factura.");
  const status = clean(payload.status);
  if (status && !allowedStatuses.has(status)) {
    throw new InvalidEquipmentStatusError(status);
  }

  const partsCostCents =
    "partsCostCents" in payload
      ? parseOptionalCents(payload.partsCostCents, "piezas")
      : undefined;
  const laborCostCents =
    "laborCostCents" in payload
      ? parseOptionalCents(payload.laborCostCents, "mano de obra")
      : undefined;
  if ((partsCostCents !== undefined || laborCostCents !== undefined) &&
      (partsCostCents ?? current.partsCostCents) + (laborCostCents ?? current.laborCostCents) > MAX_MONEY_CENTS) {
    throw new InvalidMoneyValueError("total");
  }
  const finalStatus = status || current.status;
  const costsChanged =
    (partsCostCents !== undefined &&
      partsCostCents !== current.partsCostCents) ||
    (laborCostCents !== undefined &&
      laborCostCents !== current.laborCostCents);
  const requestedExitDate =
    "exitDate" in payload
      ? parseOptionalIsoDate(payload.exitDate, "salida")
      : undefined;

  // `updated_at` es timestamptz: se envía un Date y el driver lo tipa. Antes era
  // una cadena ISO sobre una columna de texto, que ordenaba mal frente al
  // formato que escribía el default de la base.
  const values: Record<string, string | number | Date | null> = {
    updatedAt: new Date(),
  };

  if (status) values.status = status;
  if("assignedMemberId" in payload)values.assignedMemberId=payload.assignedMemberId as number|null;
  if ("assignedTechnician" in payload) {
    values.assignedTechnician = clean(payload.assignedTechnician) || "Sin asignar";
  }
  if ("diagnosis" in payload) values.diagnosis = clean(payload.diagnosis);
  if ("partsDescription" in payload) {
    values.partsDescription = clean(payload.partsDescription);
  }
  if (partsCostCents !== undefined) {
    values.partsCostCents = partsCostCents;
  }
  if ("laborDescription" in payload) {
    values.laborDescription = clean(payload.laborDescription);
  }
  if (laborCostCents !== undefined) {
    values.laborCostCents = laborCostCents;
  }
  if ("notes" in payload) values.notes = clean(payload.notes);

  // Datos del cliente y del equipo. Antes solo se podían escribir al dar de
  // alta: una errata en el nombre o en el teléfono se quedaba para siempre,
  // que es justo el dato que se teclea con prisa en el mostrador.
  for (const [field, label] of REQUIRED_TEXT_FIELDS) {
    if (!(field in payload)) continue;
    const value = clean(payload[field]);
    if (!value) throw new RequiredEquipmentFieldError(label);
    values[field] = value;
  }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (field in payload) values[field] = clean(payload[field]);
  }

  if ("customerPhone" in payload) {
    values.customerPhone = parseOptionalCustomerPhone(payload.customerPhone);
  }
  if ("customerEmail" in payload) {
    values.customerEmail = parseOptionalCustomerEmail(payload.customerEmail);
  }

  // La fecha de ingreso es NOT NULL. Vaciar el campo en el formulario se lee
  // como "no la cambies", no como un error: se comprueba antes de parsear
  // porque parseOptionalIsoDate rechaza la cadena vacía por formato, y ese
  // mensaje no explicaría nada a quien solo borró el recuadro. Una fecha
  // escrita pero inválida sí se rechaza.
  if ("entryDate" in payload && clean(payload.entryDate)) {
    const entryDate = parseOptionalIsoDate(payload.entryDate, "ingreso");
    if (entryDate) values.entryDate = entryDate;
  }

  if ("warrantyDays" in payload) values.warrantyDays = parseWarrantyDays(payload.warrantyDays);
  if ("estimatedExitDate" in payload || "entryDate" in values) {
    const entryDate = typeof values.entryDate === "string" ? values.entryDate : current.entryDate;
    values.estimatedExitDate = parseEstimatedExitDate(
      "estimatedExitDate" in payload ? payload.estimatedExitDate : current.estimatedExitDate,
      entryDate,
    );
  }

  if (status === "entregado") {
    const currentExitDate =
      current.exitDate && isValidIsoDate(current.exitDate)
        ? current.exitDate
        : undefined;
    values.exitDate = requestedExitDate || currentExitDate || todayInPanama();
    values.invoiceNumber =
      clean(payload.invoiceNumber) ||
      current.invoiceNumber ||
      `NF-${String(current.id).padStart(7, "0")}`;
  } else if (
    status &&
    (current.status === "entregado" || current.exitDate || current.invoiceNumber)
  ) {
    values.exitDate = null;
    values.invoiceNumber = null;
    values.invoiceSubtotalCents = null;
    values.invoiceTaxCents = null;
    values.invoiceTotalCents = null;
    values.invoiceTaxRate = null;
    values.invoiceTechnician = null;
  }

  const issuingInvoice =
    status === "entregado" && current.status !== "entregado";
  const correctingDeliveredCosts =
    current.status === "entregado" &&
    finalStatus === "entregado" &&
    costsChanged;

  const technicianInvoice=issuingInvoice||current.invoiceKind==="technician";
  if(issuingInvoice){
    const technician=clean(payload.assignedTechnician)||current.assignedTechnician;
    if(!technician||technician==="Sin asignar")throw new RequiredEquipmentFieldError("El técnico que realizó el trabajo");
    values.invoiceKind="technician";
    values.invoiceTechnician=technician;
  }
  if (issuingInvoice || correctingDeliveredCosts) {
    const totals = calculateTotals(
      technicianInvoice?0:partsCostCents ?? current.partsCostCents ?? 0,
      laborCostCents ?? current.laborCostCents ?? 0,
    );
    if (totals.totalCents > MAX_MONEY_CENTS) throw new InvalidMoneyValueError("total");
    values.invoiceSubtotalCents = totals.subtotalCents;

    if (technicianInvoice) {
      // Nulo, no cero: distingue una factura nueva emitida sin impuesto de una
      // a la que se le aplicó un 0 %. Las facturas históricas conservan su
      // política fiscal mediante las ramas siguientes.
      values.invoiceTaxCents = null;
      values.invoiceTaxRate = null;
      values.invoiceTotalCents = totals.totalCents;
    } else if (validHistoricalTaxRate(current.invoiceTaxRate)) {
      // Una factura histórica conserva la política fiscal con la que se emitió.
      // Al corregir su base se vuelve a redondear el impuesto en centavos para
      // que subtotal + impuesto siempre sea igual al total persistido.
      const taxCents = Math.round(totals.subtotalCents * current.invoiceTaxRate);
      values.invoiceTaxCents = taxCents;
      values.invoiceTaxRate = current.invoiceTaxRate;
      values.invoiceTotalCents = totals.subtotalCents + taxCents;
    } else if (validHistoricalTaxCents(current.invoiceTaxCents)) {
      // Algunos registros importados solo conservan el importe fiscal, no la
      // tasa. Ese importe sigue formando parte de la factura corregida.
      values.invoiceTaxCents = current.invoiceTaxCents;
      values.invoiceTaxRate = null;
      values.invoiceTotalCents = totals.subtotalCents + current.invoiceTaxCents;
    } else {
      // Factura emitida bajo la política actual sin impuesto, o metadatos
      // históricos inválidos: se normaliza a la representación sin impuesto.
      values.invoiceTaxCents = null;
      values.invoiceTaxRate = null;
      values.invoiceTotalCents = totals.totalCents;
    }
  }

  if (typeof values.invoiceTotalCents === "number" && values.invoiceTotalCents > MAX_MONEY_CENTS) {
    throw new InvalidMoneyValueError("total de la factura");
  }
  return values;
}
