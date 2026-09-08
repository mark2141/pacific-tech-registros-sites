import { and, desc, eq, lt, sql, getTableColumns } from "drizzle-orm";
import { getDb } from "../../db";
import { equipment, equipmentHistory, payments } from "../../db/schema";
import { assertPaymentReplay, paymentAmount, PaymentError, type PaymentInput, type PaymentRow } from "../../lib/payments";
import type { EquipmentActor } from "../../lib/equipment-repository";

export async function listPayments(equipmentId: number, before?: number) {
  const rows = await getDb().select({ ...getTableColumns(payments), reversed: sql<boolean>`EXISTS (SELECT 1 FROM payments r WHERE r.reversal_of = "payments"."id")` }).from(payments).where(and(eq(payments.equipmentId, equipmentId), before ? lt(payments.id, before) : undefined)).orderBy(desc(payments.id)).limit(51);
  return { payments: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
}
export async function recordPayment(input: PaymentInput, actor: EquipmentActor) {
  return getDb().transaction(async tx => {
    const [order] = await tx.select().from(equipment).where(eq(equipment.id, input.equipmentId)).for("update");
    if (!order) throw new PaymentError("No se encontró la orden.", 404);
    const [previous] = await tx.select().from(payments).where(eq(payments.operationId, input.operationId));
    if (previous) { assertPaymentReplay({ ...previous, reversed: false }, input, actor.userId); return { payment: previous, replayed: true }; }
    if (order.version !== input.version) throw new PaymentError("La orden cambió. Carga la versión actual antes de registrar el pago.", 409);
    let original: PaymentRow | null = null;
    if (input.reversalOf) {
      const [source] = await tx.select().from(payments).where(eq(payments.id, input.reversalOf));
      const [reversal] = await tx.select().from(payments).where(eq(payments.reversalOf, input.reversalOf));
      if (source) original = { ...source, reversed: Boolean(reversal) };
    }
    const amountCents = paymentAmount(order, input, original);
    const [payment] = await tx.insert(payments).values({ operationId: input.operationId, equipmentId: input.equipmentId, amountCents,
      method: original?.method ?? input.method, reference: input.reference, note: input.note, reversalOf: input.reversalOf, actorUserId: actor.userId, actorEmail: actor.email }).returning();
    await tx.update(equipment).set({ paidCents: order.paidCents + amountCents, version: sql`${equipment.version} + 1`, updatedAt: new Date() }).where(eq(equipment.id, order.id));
    await tx.insert(equipmentHistory).values({ equipmentId: order.id, kind: "pago", message: `${amountCents > 0 ? "Abono" : "Anulación"} #${payment.id}: ${(amountCents / 100).toFixed(2)} · ${payment.method} · ${input.note}`, actorUserId: actor.userId, actorEmail: actor.email });
    return { payment, replayed: false };
  });
}
