"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { inventoryRequest, useInventoryOperation } from "./inventory-client";
import { formatMoney } from "../lib/totals";
import type { InventoryItem, OrderPart } from "../lib/inventory";

export function OrderInventory({ equipmentId, status, disabled, onBusy, onDirty, onChanged }: { equipmentId: number; status: string; disabled: boolean; onBusy: (busy: boolean) => void; onDirty: (dirty: boolean) => void; onChanged: () => void }) {
  const [search, setSearch] = useState(""); const query = useDeferredValue(search.trim());
  const [items, setItems] = useState<InventoryItem[]>([]); const [total, setTotal] = useState(0);
  const [item, setItem] = useState<InventoryItem | null>(null); const [source, setSource] = useState<OrderPart | null>(null);
  const [quantity, setQuantity] = useState(""); const [note, setNote] = useState("");
  const [parts, setParts] = useState<OrderPart[]>([]); const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true); const [catalogLoading, setCatalogLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [catalogError, setCatalogError] = useState(""); const [notice, setNotice] = useState(""); const [refresh, setRefresh] = useState(0);
  const historyRequest = useRef<AbortController | null>(null); const move = useInventoryOperation();
  const closed = status === "entregado" || status === "anulado";
  const dirty = Boolean(item || quantity || note);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve(); if (controller.signal.aborted) return; setCatalogLoading(true); setCatalogError("");
      try { const data = await inventoryRequest<{ items: InventoryItem[]; total: number }>(`/api/inventory?${new URLSearchParams({ search: query })}`, { signal: controller.signal }); if (!controller.signal.aborted) { setItems(data.items); setTotal(data.total); } }
      catch (error) { if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : "No se pudo cargar el catálogo."); }
      finally { if (!controller.signal.aborted) setCatalogLoading(false); }
    })(); return () => controller.abort();
  }, [query, refresh]);
  useEffect(() => {
    const controller = new AbortController(); historyRequest.current?.abort(); historyRequest.current = controller;
    void (async () => {
      await Promise.resolve(); if (controller.signal.aborted) return; setLoading(true); setError("");
      try { const data = await inventoryRequest<{ parts: OrderPart[]; nextCursor: number | null }>(`/api/inventory/movements?equipmentId=${equipmentId}`, { signal: controller.signal }); if (!controller.signal.aborted) { setParts(data.parts); setCursor(data.nextCursor); } }
      catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudieron cargar los repuestos usados."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })(); return () => { controller.abort(); historyRequest.current?.abort(); };
  }, [equipmentId, refresh]);
  async function more() {
    if (!cursor || loading) return;
    const controller = new AbortController(); historyRequest.current?.abort(); historyRequest.current = controller;
    setLoading(true); setError("");
    try { const data = await inventoryRequest<{ parts: OrderPart[]; nextCursor: number | null }>(`/api/inventory/movements?equipmentId=${equipmentId}&before=${cursor}`, { signal: controller.signal }); if (!controller.signal.aborted) { setParts(previous => [...previous, ...data.parts]); setCursor(data.nextCursor); } }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudieron cargar los repuestos."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function reloadSelected(returnPart?: OrderPart) {
    if (busy || disabled) return;
    if (returnPart && dirty && !window.confirm("¿Descartar el movimiento pendiente y preparar esta devolución?")) return;
    const id = returnPart?.itemId ?? item?.id;
    if (!id) { setRefresh(value => value + 1); return; }
    setBusy(true); onBusy(true); setError("");
    try {
      const data = await inventoryRequest<{ item: InventoryItem }>(`/api/inventory?itemId=${id}`); setItem(data.item);
      if (returnPart) { setSource(returnPart); setQuantity("1"); setNote(""); }
      setRefresh(value => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo actualizar el repuesto."); }
    finally { setBusy(false); onBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!item || busy || disabled || (closed && !source)) return;
    setBusy(true); onBusy(true); setError(""); setNotice("");
    try {
      await move({ itemId: item.id, version: item.version, kind: source ? "devolucion" : "consumo", equipmentId, sourceMovementId: source?.id ?? null, quantity: Number(quantity), note });
      setItem(null); setSource(null); setQuantity(""); setNote(""); setRefresh(value => value + 1); onChanged();
      setNotice(source ? "Devolución registrada. Las unidades volvieron al inventario." : "Repuesto asociado y existencias descontadas.");
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo registrar el movimiento."); }
    finally { setBusy(false); onBusy(false); }
  }
  return <details className="order-inventory"><summary>Repuestos del inventario</summary><div className="order-inventory-body">
    <p className="field-hint">Asociar descuenta existencias; devolver las repone. El costo de compra se conserva en cada movimiento y no cambia el importe cobrado al cliente.</p>
    {closed && <p className="field-hint">Orden cerrada: puedes devolver repuestos. Para asociar nuevos, guarda primero la orden en un estado activo.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}{notice && <p role="status" className="field-hint">{notice}</p>}
    {(!closed || source || dirty) && <form onSubmit={submit}><fieldset disabled={disabled || busy}>
      {!source ? <><label>Buscar en inventario<input maxLength={120} value={search} onChange={e => setSearch(e.target.value)} placeholder="Código o nombre del repuesto" /></label>{catalogError && <p className="field-error" role="alert">{catalogError}</p>}<label>Repuesto<select required value={item?.id ?? ""} disabled={catalogLoading} onChange={e => { setItem(items.find(value => value.id === Number(e.target.value)) ?? null); setQuantity(""); }}><option value="">Seleccionar repuesto</option>{item && !items.some(value => value.id === item.id) && <option value={item.id}>{item.sku} · {item.name}</option>}{items.map(value => <option key={value.id} value={value.id} disabled={!value.stock}>{value.sku} · {value.name} · {value.stock} disponibles</option>)}</select></label>{total > items.length && <p className="field-hint">Se muestran {items.length} de {total}. Busca por código para encontrar el repuesto.</p>}</> : <p><strong>Devolver: {source.sku} · {source.name}</strong></p>}
      {item && <p className="field-hint">Disponibles: {item.stock} · Costo compra: {formatMoney(source?.unitCostCents ?? item.unitCostCents)}</p>}
      <label>Cantidad<input required type="number" min="1" max={source ? source.quantity - source.returned : item?.stock ?? 0} step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Motivo / trabajo<input required maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder={source ? "Motivo de la devolución" : "Repuesto instalado o utilizado"} /></label>
      <div className="contact-actions"><button className="secondary-button" disabled={!item || disabled || busy || (closed && !source)}>{source ? "Devolver al inventario" : "Asociar y descontar"}</button>{dirty && <button type="button" className="ghost-button" onClick={() => { setSource(null); setItem(null); setQuantity(""); setNote(""); }}>{source ? "Cancelar devolución" : "Limpiar movimiento"}</button>}</div>
    </fieldset></form>}
    <button type="button" className="ghost-button" disabled={busy || disabled} onClick={() => void reloadSelected()}>Actualizar existencias y movimientos</button>
    <ul className="order-parts-list">{parts.map(part => <li key={part.id}><strong>{part.sku} · {part.name}</strong><span>Usadas: {part.quantity - part.returned} · Devueltas: {part.returned}</span><small>Costo unitario de compra: {formatMoney(part.unitCostCents)}</small>{part.quantity > part.returned && <button type="button" className="ghost-button" disabled={busy || disabled} onClick={() => void reloadSelected(part)}>Preparar devolución</button>}</li>)}</ul>
    {loading && <p role="status">Cargando repuestos…</p>}{!loading && !parts.length && <p className="field-hint">Esta orden aún no tiene repuestos asociados.</p>}{cursor && <button type="button" className="secondary-button" disabled={loading} onClick={() => void more()}>Cargar anteriores</button>}
  </div></details>;
}
