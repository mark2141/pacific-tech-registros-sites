"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useModal } from "./use-modal";
import { confirmDiscardChanges, useUnsavedChanges } from "./use-unsaved-changes";
import { centsToDollarInput, dollarsToCents, formatMoney } from "../lib/totals";
import type { InventoryItem, InventoryMovement, MovementInput } from "../lib/inventory";

export async function inventoryRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
  return data;
}
export function useInventoryOperation() {
  const pending = useRef<{ signature: string; id: string } | null>(null);
  return async (values: Omit<MovementInput, "operationId">) => {
    const signature = JSON.stringify({ ...values, version: undefined });
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    let result: { item: InventoryItem; movement: InventoryMovement };
    try {
      result = await inventoryRequest<typeof result>("/api/inventory/movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, operationId: pending.current.id }) });
    } catch (error) {
      if (error instanceof TypeError) throw new Error("No se pudo confirmar el movimiento. Reintenta sin cambiar los datos para comprobarlo.");
      throw error;
    }
    pending.current = null;
    return result;
  };
}
type InventoryPage = { items: InventoryItem[]; total: number; nextCursor: number | null; summary: { total: number; lowStock: number; outOfStock: number } };
export function InventoryPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState<InventoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  useUnsavedChanges(dirty || busy);
  const close = () => { if (!busy && (!dirty || confirmDiscardChanges())) onClose(); };
  const modalRef = useModal(close);
  useEffect(() => {
    const controller = new AbortController(); requestRef.current?.abort(); requestRef.current = controller;
    void (async () => {
      await Promise.resolve(); if (controller.signal.aborted) return;
      setLoading(true); setError(""); setPage(null);
      try {
        const data = await inventoryRequest<InventoryPage>(`/api/inventory?${new URLSearchParams({ search: query, low: lowOnly ? "1" : "0" })}`, { signal: controller.signal });
        if (!controller.signal.aborted) setPage(data);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar el inventario."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); requestRef.current?.abort(); };
  }, [query, lowOnly, refresh]);
  async function more() {
    if (!page?.nextCursor || loading) return;
    const controller = new AbortController(); requestRef.current?.abort(); requestRef.current = controller;
    setLoading(true); setError("");
    try {
      const data = await inventoryRequest<InventoryPage>(`/api/inventory?${new URLSearchParams({ search: query, low: lowOnly ? "1" : "0", before: String(page.nextCursor) })}`, { signal: controller.signal });
      if (!controller.signal.aborted) setPage(current => ({ ...data, items: [...(current?.items ?? []), ...data.items] }));
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar el inventario."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function choose(item: InventoryItem | null) {
    if (busy || (dirty && !confirmDiscardChanges())) return;
    setSelected(item); setEditing(true); setDirty(false); setEditorKey(value => value + 1);
  }
  async function reloadItem() {
    if (!selected || busy || (dirty && !confirmDiscardChanges())) return;
    setBusy(true); setError("");
    try { const data = await inventoryRequest<{ item: InventoryItem }>(`/api/inventory?itemId=${selected.id}`); setSelected(data.item); setDirty(false); setEditorKey(value => value + 1); setRefresh(value => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : "No se pudo recargar el repuesto."); }
    finally { setBusy(false); }
  }
  function saved(item: InventoryItem) {
    if (!selected) setEditorKey(value => value + 1);
    setSelected(item); setRefresh(value => value + 1); onChanged();
  }
  return <div ref={modalRef} className="inventory-backdrop" role="dialog" aria-modal="true" aria-labelledby="inventory-title">
    <div className="inventory-toolbar"><button data-autofocus className="ghost-button" onClick={close}>← Volver</button><h2 id="inventory-title">Inventario de repuestos</h2><button className="primary-button" disabled={busy} onClick={() => choose(null)}>＋ Nuevo repuesto</button></div>
    <div className="inventory-content">
      {page && <div className="inventory-summary"><span><strong>{page.summary.total}</strong> repuestos</span><button className="stock-alert" onClick={() => setLowOnly(true)}>{page.summary.lowStock} con stock bajo · {page.summary.outOfStock} sin existencias</button></div>}
      <div className="inventory-layout"><section className="inventory-list">
        <div className="inventory-filters"><label>Buscar repuesto<input maxLength={120} value={search} onChange={event => setSearch(event.target.value)} placeholder="Código, nombre o proveedor" /></label><label className="check-label"><input type="checkbox" checked={lowOnly} onChange={event => setLowOnly(event.target.checked)} />Sólo stock bajo</label><button className="secondary-button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Actualizar</button></div>
        <p className="field-hint">Alerta cuando las existencias son iguales o inferiores al stock mínimo.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="table-wrap"><table><thead><tr><th>Repuesto</th><th>Existencias</th><th>Costo compra</th></tr></thead><tbody>{page?.items.map(item => <tr key={item.id} className={selected?.id === item.id ? "inventory-selected" : ""}><td><button className="order-link" onClick={() => choose(item)}>{item.sku} · {item.name}</button><small>{item.supplier || "Sin proveedor"}</small></td><td><strong>{item.stock}</strong><small>Mínimo: {item.minimumStock}</small>{item.stock <= item.minimumStock && <span className="stock-low">{item.stock === 0 ? "Sin existencias" : "Stock bajo"}</span>}</td><td>{formatMoney(item.unitCostCents)}</td></tr>)}{!loading && !page?.items.length && <tr><td colSpan={3}>No hay repuestos para estos filtros. Crea un repuesto para registrar existencias.</td></tr>}</tbody></table></div>
        {loading && <p role="status">Cargando inventario…</p>}{page && <p className="field-hint">{page.items.length} de {page.total} repuestos</p>}{page?.nextCursor && <button className="secondary-button" disabled={loading || query !== search.trim()} onClick={() => void more()}>Cargar más</button>}
      </section>
      {editing ? <InventoryEditor key={editorKey} item={selected} busy={busy} onBusy={setBusy} onDirty={setDirty} onSaved={saved} onReload={reloadItem} /> : <aside className="inventory-editor"><h3>Control de existencias</h3><p>Selecciona un repuesto para editarlo, registrar entradas o salidas y consultar sus movimientos.</p><p>Para utilizarlo en una reparación, abre la orden y entra en «Repuestos del inventario».</p></aside>}
      </div>
    </div>
  </div>;
}

function InventoryEditor({ item, busy, onBusy, onDirty, onSaved, onReload }: { item: InventoryItem | null; busy: boolean; onBusy: (busy: boolean) => void; onDirty: (dirty: boolean) => void; onSaved: (item: InventoryItem) => void; onReload: () => Promise<void> }) {
  const [form, setForm] = useState(() => ({ sku: item?.sku ?? "", name: item?.name ?? "", supplier: item?.supplier ?? "", cost: centsToDollarInput(item?.unitCostCents ?? 0), minimum: String(item?.minimumStock ?? 0), initial: "0" }));
  const [baseline, setBaseline] = useState(form);
  const [quantity, setQuantity] = useState(""); const [note, setNote] = useState(""); const [kind, setKind] = useState<"entrada" | "salida">("entrada");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const move = useInventoryOperation();
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline) || Boolean(quantity || note);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  async function saveMetadata(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setNotice(null);
    const cents = dollarsToCents(form.cost);
    if (cents === null) { setNotice({ text: "Revisa el costo de compra.", error: true }); return; }
    onBusy(true);
    try {
      const data = await inventoryRequest<{ item: InventoryItem }>("/api/inventory", { method: item ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item?.id, version: item?.version, sku: form.sku, name: form.name, supplier: form.supplier, unitCostCents: cents, minimumStock: Number(form.minimum), initialStock: Number(form.initial) }) });
      const saved = { ...form, sku: data.item.sku, name: data.item.name, supplier: data.item.supplier, cost: centsToDollarInput(data.item.unitCostCents) };
      setForm(saved); setBaseline(saved); onSaved(data.item); setNotice({ text: "Repuesto guardado.", error: false });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "No se pudo guardar.", error: true }); }
    finally { onBusy(false); }
  }
  async function adjust(event: React.FormEvent) {
    event.preventDefault(); if (!item || busy) return;
    onBusy(true); setNotice(null);
    try {
      const data = await move({ itemId: item.id, version: item.version, kind, quantity: Number(quantity), note, equipmentId: null, sourceMovementId: null });
      setQuantity(""); setNote(""); onSaved(data.item); setNotice({ text: "Movimiento registrado.", error: false });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "No se pudo registrar el movimiento.", error: true }); }
    finally { onBusy(false); }
  }
  return <aside className="inventory-editor"><div className="history-heading"><h3>{item ? item.sku : "Nuevo repuesto"}</h3>{item && <button className="ghost-button" disabled={busy} onClick={() => void onReload()}>Recargar datos</button>}</div>
    {notice && <p className={notice.error ? "field-error" : "field-hint"} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
    <form onSubmit={saveMetadata}><fieldset disabled={busy}><label>Código único<input required maxLength={60} pattern="[A-Za-z0-9._\-]+" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="Ej. PANT-IP13" /></label><label>Nombre<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Proveedor<input maxLength={120} value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></label><div className="form-grid"><label>Costo de compra (USD)<input required type="number" min="0" max="21474836.47" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></label><label>Stock mínimo<input required type="number" min="0" max="1000000" step="1" value={form.minimum} onChange={e => setForm({ ...form, minimum: e.target.value })} /></label></div>{!item && <label>Existencias iniciales<input required type="number" min="0" max="1000000" step="1" value={form.initial} onChange={e => setForm({ ...form, initial: e.target.value })} /></label>}<button className="primary-button" disabled={busy}>Guardar repuesto</button></fieldset></form>
    {item && <><h3>Existencias: {item.stock}</h3><form onSubmit={adjust}><fieldset disabled={busy}><div className="form-grid"><label>Movimiento<select value={kind} onChange={e => setKind(e.target.value as "entrada" | "salida")}><option value="entrada">Entrada</option><option value="salida">Salida / ajuste</option></select></label><label>Cantidad<input required type="number" min="1" max={kind === "salida" ? item.stock : 1000000 - item.stock} step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label></div><label>Motivo<input required maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="Compra, conteo físico, merma…" /></label><button className="secondary-button" disabled={busy}>Registrar movimiento</button></fieldset></form><InventoryHistory item={item} /></>}
    {dirty && <p className="unsaved-hint">Cambios sin guardar</p>}
  </aside>;
}
function InventoryHistory({ item }: { item: InventoryItem }) {
  const [events, setEvents] = useState<InventoryMovement[]>([]); const [cursor, setCursor] = useState<number | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [refresh, setRefresh] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); requestRef.current?.abort(); requestRef.current = controller;
    void (async () => {
      await Promise.resolve(); if (controller.signal.aborted) return; setLoading(true); setError("");
      try { const data = await inventoryRequest<{ movements: InventoryMovement[]; nextCursor: number | null }>(`/api/inventory/movements?itemId=${item.id}`, { signal: controller.signal }); if (!controller.signal.aborted) { setEvents(data.movements); setCursor(data.nextCursor); } }
      catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar el historial."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); requestRef.current?.abort(); };
  }, [item.id, item.version, refresh]);
  async function more() {
    if (!cursor || loading) return; setLoading(true); setError("");
    const controller = new AbortController(); requestRef.current?.abort(); requestRef.current = controller;
    try { const data = await inventoryRequest<{ movements: InventoryMovement[]; nextCursor: number | null }>(`/api/inventory/movements?itemId=${item.id}&before=${cursor}`, { signal: controller.signal }); if (!controller.signal.aborted) { setEvents(previous => [...previous, ...data.movements]); setCursor(data.nextCursor); } }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar el historial."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <section><div className="history-heading"><h3>Movimientos</h3><button className="ghost-button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Actualizar</button></div>{error && <p className="field-error" role="alert">{error}</p>}<ol className="history-list">{events.map(event => <li key={event.id}><strong>{event.quantity > 0 ? "+" : ""}{event.quantity} · {event.kind} · Stock: {event.stockAfter}</strong><p>{event.note}</p><small>{new Date(event.createdAt).toLocaleString("es-PA", { timeZone: "America/Panama" })} · {event.actorEmail}</small></li>)}</ol>{loading && <p role="status">Cargando movimientos…</p>}{!loading && !events.length && <p className="field-hint">Aún no hay movimientos.</p>}{cursor && <button className="secondary-button" disabled={loading} onClick={() => void more()}>Cargar anteriores</button>}</section>;
}
