"use client";

import { useEffect, useRef, useState } from "react";

type HistoryEvent = {
  id: number; kind: string; message: string; fromStatus: string | null;
  toStatus: string | null; actorEmail: string; createdAt: string;
};
const labels: Record<string, string> = { ingreso: "Ingreso", diagnostico: "Diagnóstico", reparacion: "En reparación", listo: "Listo", entregado: "Entregado", anulado: "Anulado" };
const eventDate = (date: string) => new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Panama" }).format(new Date(date));

export function EquipmentHistory({ equipmentId, version, legacyNote, note, onNoteChange, disabled, onBusyChange }: {
  equipmentId: number; version: number; legacyNote: string; note: string;
  onNoteChange: (value: string) => void; disabled: boolean; onBusyChange: (value: boolean) => void;
}) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastContact, setLastContact] = useState<HistoryEvent | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/equipment/history?equipmentId=${equipmentId}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { history: HistoryEvent[]; nextCursor: string | null; lastContact: HistoryEvent | null; error?: string };
        if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
        if (!controller.signal.aborted) { setEvents(data.history); setCursor(data.nextCursor); setLastContact(data.lastContact); }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar el historial."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); activeRequest.current?.abort(); };
  }, [equipmentId, version, refresh]);

  async function loadOlder() {
    if (!cursor || loading) return;
    const controller = new AbortController();
    activeRequest.current?.abort(); activeRequest.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/equipment/history?equipmentId=${equipmentId}&before=${cursor}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json() as { history: HistoryEvent[]; nextCursor: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
      if (!controller.signal.aborted) {
        setEvents(previous => [...previous, ...data.history.filter((event: HistoryEvent) => !previous.some(item => item.id === event.id))]);
        setCursor(data.nextCursor);
      }
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar el historial."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  async function addNote() {
    if (sending || disabled || !note.trim()) return;
    setSending(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/equipment/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ equipmentId, message: note }) });
      const data = await response.json() as { history: HistoryEvent[]; nextCursor: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la nota.");
      onNoteChange(""); setRefresh(value => value + 1); setNotice("Nota añadida al historial.");
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo guardar la nota."); }
    finally { setSending(false); onBusyChange(false); }
  }

  return <section className="order-history" aria-labelledby="history-title">
    <div className="history-heading"><h3 id="history-title">Historial de la orden</h3><button type="button" className="ghost-button" disabled={loading || sending} onClick={() => setRefresh(value => value + 1)}>Actualizar historial</button></div>
    <p className="field-hint">Las notas se guardan por separado, con fecha y autor. Horario de Panamá.</p>
    {lastContact && <p className="last-contact"><strong>Último contacto:</strong> {eventDate(lastContact.createdAt)} · {lastContact.actorEmail}<br />{lastContact.message.split("\n")[0]}</p>}
    {legacyNote && <div className="legacy-note"><strong>Nota anterior</strong><p>{legacyNote}</p><small>Conservada del registro original. Autor y fecha no registrados.</small></div>}
    <label>Nueva nota<textarea maxLength={2000} value={note} disabled={disabled || sending} onChange={event => onNoteChange(event.target.value)} placeholder="Llamada al cliente, repuesto solicitado, acuerdo…" /></label>
    <button type="button" className="secondary-button" disabled={disabled || sending || !note.trim()} onClick={() => void addNote()}>{sending ? "Guardando nota…" : "Añadir nota"}</button>
    {error && <p className="field-error" role="alert">{error}</p>}
    {notice && <p className="field-hint" role="status">{notice}</p>}
    <ol className="history-list">{events.map(event => <li key={event.id}>
      <strong>{event.kind === "pago" ? "Movimiento de pago" : event.kind === "nota" ? "Nota" : event.kind === "repuesto" ? "Movimiento de repuesto" : event.kind === "contacto" ? "Contacto registrado" : event.kind === "ingreso" ? "Ingreso registrado" : `${labels[event.fromStatus || ""] || event.fromStatus} → ${labels[event.toStatus || ""] || event.toStatus}`}</strong>
      {event.message && <p>{event.message}</p>}
      <small><time dateTime={event.createdAt}>{eventDate(event.createdAt)}</time> · {event.actorEmail || "Usuario autenticado"}</small>
    </li>)}</ol>
    {loading && <p role="status" className="field-hint">Cargando historial…</p>}
    {!loading && !error && !events.length && <p className="field-hint">Los nuevos cambios de estado y notas aparecerán aquí. No se reconstruye el historial anterior.</p>}
    {cursor && <button type="button" className="ghost-button" disabled={loading} onClick={() => void loadOlder()}>Cargar anteriores</button>}
  </section>;
}
