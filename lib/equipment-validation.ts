// These limits are shared by the API and the forms. No database migration is
// needed: they match the limits already shown by the existing interface.
export const EQUIPMENT_TEXT_FIELDS = {
  customerName: { label: "El nombre del cliente", max: 120 },
  equipmentType: { label: "El tipo de equipo", max: 120 },
  assignedTechnician: { label: "El técnico asignado", max: 100 },
  brand: { label: "La marca", max: 80 },
  model: { label: "El modelo", max: 120 },
  serialNumber: { label: "El serial / IMEI", max: 120 },
  accessories: { label: "Los accesorios", max: 300 },
  reportedIssue: { label: "La falla reportada", max: 2000 },
  damageNotes: { label: "Los daños visibles", max: 2000 },
  diagnosis: { label: "El diagnóstico", max: 4000 },
  partsDescription: { label: "La descripción de piezas", max: 500 },
  laborDescription: { label: "La descripción de mano de obra", max: 500 },
  notes: { label: "La nota", max: 2000 },
  invoiceNumber: { label: "El número de factura", max: 80 },
  status: { label: "El estado", max: 30 },
} as const;

export class InvalidEquipmentPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEquipmentPayloadError";
  }
}

export function validateEquipmentTextFields(payload: Record<string, unknown>) {
  for (const [field, { label, max }] of Object.entries(EQUIPMENT_TEXT_FIELDS)) {
    const value = payload[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") throw new InvalidEquipmentPayloadError(`${label} debe ser texto.`);
    if (value.trim().length > max) throw new InvalidEquipmentPayloadError(`${label} admite hasta ${max} caracteres.`);
  }
}

export async function readEquipmentPayload(request: Request): Promise<Record<string, unknown>> {
  let payload: unknown;
  try { payload = await request.json(); }
  catch { throw new InvalidEquipmentPayloadError("No se pudieron leer los datos enviados. Revisa el formulario e inténtalo nuevamente."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InvalidEquipmentPayloadError("Los datos enviados deben ser un registro válido.");
  }
  const record = payload as Record<string, unknown>;
  validateEquipmentTextFields(record);
  return record;
}
