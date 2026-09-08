import { InvalidEquipmentPayloadError } from "./equipment-validation.ts";
import { isValidIsoDate } from "./equipment-values.ts";

export class EquipmentConflictError extends Error {
  constructor() {
    super("Otra sesión modificó esta orden. Tus cambios siguen en el formulario. Carga la versión actual antes de volver a guardar.");
    this.name = "EquipmentConflictError";
  }
}

export function expectedVersion(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value >= 2_147_483_647) {
    throw new EquipmentConflictError();
  }
  return value;
}

export function parseWarrantyDays(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) {
    throw new InvalidEquipmentPayloadError("La garantía debe ser un número entero de días (0 a 3650).");
  }
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 0 || days > 3650) {
    throw new InvalidEquipmentPayloadError("La garantía debe estar entre 0 y 3650 días.");
  }
  return days;
}

export function parseEstimatedExitDate(value: unknown, entryDate?: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !isValidIsoDate(value)) {
    throw new InvalidEquipmentPayloadError("La fecha estimada de entrega no es válida.");
  }
  if (entryDate && value < entryDate) {
    throw new InvalidEquipmentPayloadError("La entrega estimada no puede ser anterior al ingreso.");
  }
  return value;
}

export function parseHistoryNote(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2000) {
    throw new InvalidEquipmentPayloadError("Escribe una nota de entre 1 y 2000 caracteres.");
  }
  return value.trim();
}

/** Calendar days, independent of the browser's timezone. Closed orders stop counting. */
export function workshopDays(entryDate: string, today: string, exitDate?: string | null) {
  const end = exitDate || today;
  if (!isValidIsoDate(entryDate) || !isValidIsoDate(end)) return 0;
  return Math.max(0, Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(entryDate + "T00:00:00Z")) / 86_400_000));
}
