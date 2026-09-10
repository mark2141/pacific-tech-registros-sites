import { contactLine, type BusinessInfo } from "./business-info.ts";
import { isValidCustomerEmail } from "./contact-values.ts";
import { formatMoney } from "./totals.ts";

export const DEFAULT_LABOR_DESCRIPTION = "Servicio técnico / mano de obra";

export type InvoiceEmailRecord = {
  invoiceKind?:string;
  invoiceTechnician?:string|null;
  id: number;
  orderNumber: string;
  invoiceNumber: string | null;
  customerName: string;
  customerEmail: string;
  equipmentType: string;
  brand: string;
  model: string;
  diagnosis: string;
  reportedIssue: string;
  partsDescription: string;
  partsCostCents: number;
  laborDescription: string;
  laborCostCents: number;
  invoiceTotalCents: number | null;
  warrantyDays: number;
};

/** El emisor llega como parámetro: sus datos viven en el entorno, no aquí. */
export function buildInvoiceEmailHref(
  record: InvoiceEmailRecord,
  business: BusinessInfo,
) {
  if(record.invoiceKind==="technician"){
    const recipient=business.email.trim();
    if(!isValidCustomerEmail(recipient))return null;
    const number=record.invoiceNumber||`NF-${String(record.id).padStart(7,"0")}`;
    const body=[`Para: Pacific Tech`,`Factura de mano de obra: ${number}`,`Orden: ${record.orderNumber}`,`Equipo: ${[record.equipmentType,record.brand,record.model].filter(Boolean).join(" ")}`,`Trabajo realizado por: ${record.invoiceTechnician||"Sin especificar"}`,`Servicio: ${record.laborDescription||DEFAULT_LABOR_DESCRIPTION}`,`Mano de obra: ${formatMoney(record.invoiceTotalCents)}`].join("\n");
    return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`Mano de obra ${number} · ${record.invoiceTechnician}`)}&body=${encodeURIComponent(body)}`;
  }
  const recipient = record.customerEmail.trim();
  if (!isValidCustomerEmail(recipient)) return null;

  const invoiceNumber =
    record.invoiceNumber || `NF-${String(record.id).padStart(7, "0")}`;
  const equipment = [record.equipmentType, record.brand, record.model]
    .filter(Boolean)
    .join(" ");
  const service = record.laborDescription || DEFAULT_LABOR_DESCRIPTION;
  const workSummary = (record.diagnosis || record.reportedIssue).slice(0, 500);
  const lines = [
    `Hola ${record.customerName},`,
    "",
    `Esta es una copia de tu factura no fiscal de ${business.legalName}.`,
    "",
    `Factura: ${invoiceNumber}`,
    `Orden de servicio: ${record.orderNumber}`,
    `Equipo: ${equipment || "No especificado"}`,
    "",
  ];

  if (record.partsCostCents > 0) {
    lines.push(
      `Piezas: ${record.partsDescription || "Piezas y repuestos"} — ${formatMoney(record.partsCostCents)}`,
    );
  }
  lines.push(
    `Mano de obra: ${service} — ${formatMoney(record.laborCostCents)}`,
    `Trabajo realizado: ${workSummary || "No especificado"}`,
    "",
    // Un solo importe: la factura ya no desglosa impuesto, y repetir el
    // subtotal cuando coincide con el total solo añade ruido.
    `Total: ${formatMoney(record.invoiceTotalCents)}`,
    "",
    `Garantía del servicio: ${record.warrantyDays} días.`,
    "",
    `Gracias por confiar en ${business.legalName}.`,
    contactLine(business),
  );

  const subject = `Factura ${invoiceNumber} · ${business.legalName}`;
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
