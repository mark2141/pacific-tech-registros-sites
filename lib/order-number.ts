const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-\d{2}$/;

export const ORDER_SEQUENCE_WIDTH = 3;

export function orderNumberPrefix(date: string) {
  const match = ISO_DATE_PREFIX.exec(date);
  if (!match) {
    throw new Error("No se pudo determinar el mes de la orden.");
  }

  return `OT-${match[1]}${match[2]}-`;
}

export function formatOrderNumber(prefix: string, sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("El correlativo de la orden debe ser un entero positivo.");
  }

  return `${prefix}${String(sequence).padStart(ORDER_SEQUENCE_WIDTH, "0")}`;
}
