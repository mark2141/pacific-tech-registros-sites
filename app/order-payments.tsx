"use client";
import { useEffect, useRef, useState } from "react";
import { balance, paymentMethods, type PaymentRow } from "../lib/payments";
import { can, type Role } from "../lib/permissions";
import { dollarsToCents, formatMoney } from "../lib/totals";
import { inventoryRequest } from "./inventory-client";
type Page = { payments: PaymentRow[]; nextCursor: number | null; balance: ReturnType<typeof balance>; version: number };
export function OrderPayments({ equipmentId, role, disabled, onBusy, onDirty, onSaved }: { equipmentId: number; role: Role; disabled: boolean; onBusy: (value: boolean) => void; onDirty: (value: boolean) => void; onSaved: () => Promise<void> }) {
  const [page, setPage] = useState<Page | null>(null), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(""), [method, setMethod] = useState("efectivo"), [reference, setReference] = useState(""), [note, setNote] = useState("");
  const [reversal, setReversal] = useState<PaymentRow | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const operation = useRef<{ intent: string; id: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const dirty = Boolean(amount || note || reference || reversal);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    void (async () => {
      await Promise.resolve(); if (controller.signal.aborted) return; setLoading(true); setError("");
      try { const data = await inventoryRequest<Page>(`/api/equipment/payments?equipmentId=${equipmentId}`, { signal: controller.signal }); if (!controller.signal.aborted) setPage(data); }
      catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudieron cargar los pagos."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })(); return () => { controller.abort(); request.current?.abort(); };
  }, [equipmentId, refresh]);
  async function more() {
    if (!page?.nextCursor || loading) return;
    const controller = new AbortController(); request.current = controller; setLoading(true); setError("");
    try {
      const next = await inventoryRequest<Page>(`/api/equipment/payments?equipmentId=${equipmentId}&before=${page.nextCursor}`, { signal: controller.signal });
      if (!controller.signal.aborted) {
        if (next.version !== page.version) { setRefresh(value => value + 1); return; }
        setPage({ ...next, payments: [...page.payments, ...next.payments] });
      }
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar el historial."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!page || disabled || busy || loading) return;
    const cents = dollarsToCents(amount);
    if (!reversal && (!cents || cents > page.balance.dueCents)) { setError("Ingresa un abono mayor que cero y no superior al saldo."); return; }
    if (reversal && !window.confirm(`¿Anular el pago #${reversal.id} de ${formatMoney(reversal.amountCents)}? Se conservará en el historial junto al motivo.`)) return;
    const intent = { equipmentId, amountCents: reversal ? 0 : cents, method: reversal ? "" : method, reference: reference.trim(), note: note.trim(), reversalOf: reversal?.id ?? null };
    const key = JSON.stringify(intent);
    if (operation.current?.intent !== key) operation.current = { intent: key, id: crypto.randomUUID() };
    setBusy(true); onBusy(true); setError("");
    try {
      await inventoryRequest("/api/equipment/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...intent, version: page.version, operationId: operation.current.id }) });
      operation.current = null; setAmount(""); setReference(""); setNote(""); setReversal(null); onDirty(false); setRefresh(value => value + 1);
      await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo registrar el pago."); }
    finally { setBusy(false); onBusy(false); }
  }
  return <section className="order-payments"><div className="history-heading"><h3>Pagos y saldo</h3><button type="button" className="ghost-button" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>Actualizar pagos</button></div>
    <p className="field-hint">Antes de la entrega, el saldo usa el importe estimado guardado. Registrar un pago no realiza un cargo bancario.</p>
    {page && <div className="payment-summary"><span>Importe<strong>{formatMoney(page.balance.totalCents)}</strong></span><span>Abonado<strong>{formatMoney(page.balance.paidCents)}</strong></span><span>Saldo<strong>{formatMoney(page.balance.dueCents)}</strong></span><b className="payment-state">{page.balance.label}</b></div>}
    {disabled && can(role, "charge") && <p className="field-hint">Guarda los cambios de la orden y termina las demás operaciones antes de registrar un pago.</p>}
    {can(role, "charge") && <form onSubmit={submit}><fieldset disabled={disabled || busy || loading || !page}>
      <legend>{reversal ? `Anular pago #${reversal.id} · ${formatMoney(reversal.amountCents)}` : "Registrar abono"}</legend>
      {!reversal && <div className="form-grid"><label>Monto (USD)<input required type="number" min="0.01" max={(page?.balance.dueCents ?? 0) / 100} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Forma de pago<select value={method} onChange={e => setMethod(e.target.value)}>{Object.entries(paymentMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>}
      <label>Referencia (opcional)<input maxLength={120} value={reference} onChange={e => setReference(e.target.value)} placeholder="Comprobante o referencia de transferencia" /></label>
      <label>{reversal ? "Motivo de anulación" : "Concepto"}<input required maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder={reversal ? "Explica la corrección o devolución" : "Ej. Abono para repuesto"} /></label>
      <button className="primary-button" disabled={!note.trim()}>{busy ? "Guardando…" : reversal ? "Confirmar anulación" : "Registrar abono"}</button>{reversal && <button type="button" className="ghost-button" onClick={() => { setReversal(null); setNote(""); setReference(""); }}>Cancelar anulación</button>}
    </fieldset></form>}
    {error && <p role="alert" className="field-error">{error}</p>}{loading && <p role="status">Cargando pagos…</p>}
    <ol className="history-list">{page?.payments.map(payment => <li key={payment.id}><strong>#{payment.id} · {formatMoney(payment.amountCents)} · {paymentMethods[payment.method as keyof typeof paymentMethods] || payment.method}{payment.reversed ? " · Anulado" : payment.reversalOf ? ` · Anulación de #${payment.reversalOf}` : ""}</strong><p>{payment.note}{payment.reference && ` · Ref: ${payment.reference}`}</p><small>{new Date(payment.createdAt).toLocaleString("es-PA", { timeZone: "America/Panama" })} · {payment.actorEmail}</small>{can(role, "reverse") && payment.amountCents > 0 && !payment.reversed && <button type="button" className="ghost-button" disabled={disabled || busy || loading} onClick={() => { if (dirty && !window.confirm("¿Descartar el pago sin guardar?")) return; setReversal(payment); setAmount(""); setNote(""); setReference(""); }}>Anular pago</button>}</li>)}</ol>
    {!loading && page && !page.payments.length && <p className="field-hint">No hay pagos registrados. Las facturas anteriores no se consideran cobradas automáticamente.</p>}
    {page?.nextCursor && <button type="button" className="secondary-button" disabled={loading || busy} onClick={() => void more()}>Cargar anteriores</button>}
  </section>;
}
