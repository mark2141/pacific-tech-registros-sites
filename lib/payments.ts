import { MAX_MONEY_CENTS } from "./equipment-values.ts";
export const paymentMethods = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", yappy: "Yappy", otro: "Otro" } as const;
export type PaymentInput = { operationId: string; equipmentId: number; version: number; amountCents: number; method: string; reference: string; note: string; reversalOf: number | null };
export type PaymentRow = Omit<PaymentInput, "version"> & { id: number; actorUserId: string; actorEmail: string; createdAt: string | Date; reversed: boolean };
export type BalanceOrder = { invoiceKind?:string; status: string; paidCents: number; partsCostCents: number; laborCostCents: number; invoiceTotalCents: number | null };
export class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > MAX_MONEY_CENTS) throw new PaymentError("Número inválido.");
  return value;
}
export function paymentInput(payload: Record<string, unknown>): PaymentInput {
  if (typeof payload.operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.operationId)) throw new PaymentError("Identificador de operación inválido.");
  const reversalOf = payload.reversalOf == null ? null : positiveId(payload.reversalOf);
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const reference = typeof payload.reference === "string" ? payload.reference.trim() : "";
  if (!note || note.length > 500 || reference.length > 120) throw new PaymentError("Indica un concepto o motivo (máximo 500 caracteres); referencia de hasta 120.");
  if (!reversalOf && (typeof payload.method !== "string" || !Object.hasOwn(paymentMethods, payload.method))) throw new PaymentError("Selecciona una forma de pago válida.");
  return { operationId: payload.operationId.toLowerCase(), equipmentId: positiveId(payload.equipmentId), version: positiveId(payload.version),
    amountCents: reversalOf ? 0 : positiveId(payload.amountCents), method: reversalOf ? "" : String(payload.method), reference, note, reversalOf };
}
export function balance(order: BalanceOrder) {
  const totalCents = order.status === "anulado" ? 0 : order.status === "entregado" ? order.invoiceTotalCents ?? 0 : order.invoiceKind==="technician"?order.laborCostCents:order.partsCostCents + order.laborCostCents;
  return { totalCents, paidCents: order.paidCents, dueCents: totalCents - order.paidCents,
    label: totalCents === 0 && order.paidCents === 0 ? "Sin importe" : order.paidCents === 0 ? "Pendiente" : order.paidCents < totalCents ? "Pago parcial" : "Pagado" };
}
export function paymentAmount(order: BalanceOrder, input: PaymentInput, original?: Pick<PaymentRow, "equipmentId" | "amountCents" | "reversed"> | null) {
  if (input.reversalOf) {
    if (!original || original.equipmentId !== input.equipmentId || original.amountCents <= 0 || original.reversed) throw new PaymentError("El pago no existe en esta orden o ya fue anulado.", 409);
    if (order.paidCents < original.amountCents) throw new PaymentError("El saldo cambió. Actualiza la orden.", 409);
    return -original.amountCents;
  }
  if (order.status === "anulado") throw new PaymentError("No se pueden cobrar órdenes anuladas.", 409);
  if (input.amountCents > balance(order).dueCents) throw new PaymentError("El abono supera el saldo. Guarda primero el importe del servicio o actualiza la orden.", 409);
  return input.amountCents;
}
export function assertPaymentReplay(row: PaymentRow, input: PaymentInput, userId: string) {
  if (row.equipmentId !== input.equipmentId || row.reversalOf !== input.reversalOf || row.actorUserId !== userId || row.note !== input.note || row.reference !== input.reference ||
    (!input.reversalOf && (row.amountCents !== input.amountCents || row.method !== input.method))) throw new PaymentError("Este identificador ya corresponde a otra operación.", 409);
}
export function protectPaidOrder(current: BalanceOrder, values: Record<string, unknown>) {
  if (!current.paidCents) return;
  const next = { ...current, ...values } as BalanceOrder;
  if (next.status === "anulado" || (current.status === "entregado" && next.status !== "entregado")) throw new PaymentError("Anula los pagos vigentes antes de anular o reabrir la orden.", 409);
  if (balance(next).dueCents < 0) throw new PaymentError("El nuevo total no puede ser menor que los abonos registrados.", 409);
}
