import { getSitesDb } from "./database";
import { getEquipment } from "./equipment";
import { assertPaymentReplay, paymentAmount, PaymentError, type PaymentInput, type PaymentRow } from "../../lib/payments";
import type { EquipmentActor } from "../../lib/equipment-repository";

const selection = `p.id, p.operation_id AS "operationId", p.equipment_id AS "equipmentId", p.amount_cents AS "amountCents", p.method, p.reference, p.note,
  p.reversal_of AS "reversalOf", p.actor_user_id AS "actorUserId", p.actor_email AS "actorEmail", p.created_at AS "createdAt",
  EXISTS(SELECT 1 FROM payments r WHERE r.reversal_of = p.id) AS reversed`;
const normalize = (row: PaymentRow) => ({ ...row, reversed: Boolean(row.reversed) });
export async function listPayments(equipmentId: number, before?: number) {
  const rows = await getSitesDb().prepare(`SELECT ${selection} FROM payments p WHERE p.equipment_id = ? ${before ? "AND p.id < ?" : ""} ORDER BY p.id DESC LIMIT 51`).bind(...(before ? [equipmentId, before] : [equipmentId])).all<PaymentRow>();
  return { payments: rows.results.slice(0, 50).map(normalize), nextCursor: rows.results.length > 50 ? rows.results[49].id : null };
}
async function byOperation(operationId: string) {
  return getSitesDb().prepare(`SELECT ${selection} FROM payments p WHERE p.operation_id = ?`).bind(operationId).first<PaymentRow>();
}
export async function recordPayment(input: PaymentInput, actor: EquipmentActor) {
  const previous = await byOperation(input.operationId);
  if (previous) { assertPaymentReplay(previous, input, actor.userId); return { payment: normalize(previous), replayed: true }; }
  const db = getSitesDb(), order = await getEquipment(input.equipmentId);
  if (!order) throw new PaymentError("No se encontró la orden.", 404);
  if (order.version !== input.version) throw new PaymentError("La orden cambió. Carga la versión actual antes de registrar el pago.", 409);
  const original = input.reversalOf ? await db.prepare(`SELECT ${selection} FROM payments p WHERE p.id = ?`).bind(input.reversalOf).first<PaymentRow>() : null;
  const amountCents = paymentAmount(order, input, original);
  const method = original?.method ?? input.method, now = new Date().toISOString();
  // Every payment and order edit increments the same version. The batch either
  // updates that version, ledger and history together, or makes no changes.
  const results = await db.batch([
    db.prepare(`UPDATE equipment SET paid_cents = paid_cents + ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND NOT EXISTS (SELECT 1 FROM payments WHERE operation_id = ?) RETURNING id`)
      .bind(amountCents, now, order.id, input.version, input.operationId),
    db.prepare(`INSERT INTO payments (operation_id, equipment_id, amount_cents, method, reference, note, reversal_of, actor_user_id, actor_email, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`)
      .bind(input.operationId, order.id, amountCents, method, input.reference, input.note, input.reversalOf, actor.userId, actor.email, now),
    db.prepare(`INSERT INTO equipment_history (equipment_id, kind, message, actor_user_id, actor_email, created_at)
      SELECT ?, 'pago', ? || last_insert_rowid() || ?, ?, ?, ? WHERE changes() = 1`)
      .bind(order.id, amountCents > 0 ? "Abono #" : "Anulación #", `: ${(amountCents / 100).toFixed(2)} · ${method} · ${input.note}`, actor.userId, actor.email, now),
  ]);
  const payment = await byOperation(input.operationId);
  if (!payment) throw new PaymentError("La orden cambió. Actualiza antes de registrar el pago.", 409);
  assertPaymentReplay(payment, input, actor.userId);
  return { payment: normalize(payment), replayed: results[0].results.length === 0 };
}
