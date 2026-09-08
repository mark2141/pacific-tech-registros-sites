"use client";

import { useEffect, useState } from "react";
import { todayInPanama } from "../lib/panama-date";
import { formatDate, formatMoney } from "../lib/totals";
import type { EquipmentReport } from "../lib/equipment-reports";
import { useModal } from "./use-modal";

export function EquipmentReports({ technicians, company, onClose }: { technicians: string[]; company: string; onClose: () => void }) {
  const modalRef = useModal(onClose);
  const [form, setForm] = useState(() => { const today = todayInPanama(); return { from: today.slice(0, 7) + "-01", to: today, technician: "" }; });
  const [query, setQuery] = useState(form);
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<EquipmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true); setError(""); setReport(null);
      try {
        const response = await fetch(`/api/equipment/reports?${new URLSearchParams(query)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { report?: EquipmentReport; error?: string };
        if (!response.ok || !data.report) throw new Error(data.error || "No se pudo cargar el reporte.");
        if (!controller.signal.aborted) setReport(data.report);
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "No se pudo cargar el reporte."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [query, refresh]);
  async function exportCsv() {
    if (!report || exporting) return;
    setExporting(true); setError("");
    try {
      const response = await fetch(`/api/equipment/export?${new URLSearchParams(query)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo descargar el CSV. Inténtalo nuevamente.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `ordenes-ingresadas-${report.from}-${report.to}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo descargar el CSV."); }
    finally { setExporting(false); }
  }
  return <div ref={modalRef} className="invoice-backdrop reports-backdrop" role="dialog" aria-modal="true" aria-labelledby="reports-title">
    <div className="invoice-toolbar"><button data-autofocus className="ghost-button" onClick={onClose}>← Volver</button><span id="reports-title">Indicadores y reportes</span><button className="primary-button" disabled={!report || loading} onClick={() => window.print()}>Imprimir / PDF</button></div>
    <article className="invoice-page reports-page"><header><p className="eyebrow">{company}</p><h2>Indicadores del taller</h2></header>
      <form className="report-filters tracking-filters" onSubmit={event => { event.preventDefault(); setQuery({ ...form }); setRefresh(value => value + 1); }}>
        <label>Desde<input type="date" required max={form.to} value={form.from} onChange={event => setForm({ ...form, from: event.target.value })} /></label>
        <label>Hasta<input type="date" required min={form.from} value={form.to} onChange={event => setForm({ ...form, to: event.target.value })} /></label>
        <label>Técnico<select value={form.technician} onChange={event => setForm({ ...form, technician: event.target.value })}><option value="">Todos</option>{technicians.map(name => <option key={name}>{name}</option>)}</select></label>
        <button className="secondary-button" disabled={loading}>Consultar</button>
      </form>
      {error && <p className="field-error" role="alert">{error}</p>}{loading && <p role="status">Cargando indicadores…</p>}
      {report && <>
        <p className="report-period">Período: {formatDate(report.from)} — {formatDate(report.to)} · {report.technician || "Todos los técnicos"}</p>
        <h3>Situación actual · {formatDate(report.asOf)}</h3>
        <div className="report-metrics"><div><span>En taller</span><strong>{report.active}</strong></div><div><span>Plazo vencido</span><strong>{report.overdue}</strong></div><div><span>Listos para retirar</span><strong>{report.ready}</strong></div></div>
        <p className="field-hint">Órdenes activas, independientemente del período. Un plazo vence al día siguiente de la entrega estimada.</p>
        <h3>Resultados del período</h3>
        <div className="report-metrics"><div><span>Ingresos de equipos</span><strong>{report.received}</strong></div><div><span>Equipos entregados</span><strong>{report.delivered}</strong></div><div><span>Facturado</span><strong>{formatMoney(report.invoicedCents)}</strong></div></div>
        <p>Tiempo promedio de ingreso a entrega: <strong>{report.averageTurnaroundDays === null ? "Sin entregas con fechas válidas" : `${report.averageTurnaroundDays} días`}</strong>.</p>
        <p className="field-hint">Los ingresos excluyen órdenes anuladas. Entregas, facturación y promedio usan la fecha de salida. La facturación no indica pagos cobrados.</p>
        <h3>Carga y resultados por técnico</h3>
        <div className="table-wrap"><table className="report-table"><thead><tr><th>Técnico</th><th>En taller</th><th>Vencidos</th><th>Entregados</th><th>Facturado</th></tr></thead><tbody>{report.byTechnician.map(technician => <tr key={technician.technician}><td>{technician.technician}</td><td>{technician.active}</td><td>{technician.overdue}</td><td>{technician.delivered}</td><td>{formatMoney(technician.invoicedCents)}</td></tr>)}{!report.byTechnician.length && <tr><td colSpan={5}>Sin órdenes activas ni entregas en este período.</td></tr>}</tbody></table></div>
        <p className="field-hint">La agrupación usa el técnico asignado actualmente a cada orden.</p>
        <div className="report-export"><button className="secondary-button" disabled={exporting} onClick={() => void exportCsv()}>{exporting ? "Preparando CSV…" : "Descargar órdenes en CSV"}</button><p className="field-hint">Incluye todas las órdenes ingresadas en el período y técnico seleccionados, también las anuladas, con su estado y costos.</p></div>
      </>}
    </article>
  </div>;
}
