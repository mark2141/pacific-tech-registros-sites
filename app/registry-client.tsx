"use client";

import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  Fragment,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  calculateTotals,
  centsToDollarInput,
  dollarsToCents,
  formatDate,
  formatMoney,
} from "../lib/totals";
import { todayInPanama } from "../lib/panama-date";
import {
  CUSTOMER_EMAIL_MAX_LENGTH,
  CUSTOMER_PHONE_MAX_LENGTH,
  CUSTOMER_PHONE_MIN_LENGTH,
  keepPhoneDigits,
} from "../lib/contact-values";
import {
  buildInvoiceEmailHref,
  DEFAULT_LABOR_DESCRIPTION,
} from "../lib/invoice-email";
import { contactLine, type BusinessInfo } from "../lib/business-info";
import { summarizeStatusCounts } from "../lib/equipment-summary";
import { useModal } from "./use-modal";
import { useUnsavedChanges, confirmDiscardChanges } from "./use-unsaved-changes";
import { equipmentChangeConfirmation } from "../lib/equipment-confirmation";
import { EQUIPMENT_TEXT_FIELDS } from "../lib/equipment-validation";
import { MAX_MONEY_CENTS } from "../lib/equipment-values";
import { EquipmentHistory } from "./equipment-history";
import { EquipmentReports } from "./equipment-reports";
import { CustomerContact } from "./customer-contact";
import { InventoryPanel } from "./inventory-client";
import { OrderInventory } from "./order-inventory";
import { OrderPayments } from "./order-payments";
import { OrderAttachments } from "./order-attachments";
import { BackupDownload } from "./backup-download";
import { can, roleLabels, technicianFields, type Role } from "../lib/permissions";
import { balance } from "../lib/payments";
import { ReceptionReceipt } from "./reception-receipt";
import { workshopDays } from "../lib/equipment-tracking";
import { useSessionRenewal } from "./use-session-renewal";

type Status = "ingreso" | "diagnostico" | "reparacion" | "listo" | "entregado" | "anulado";

export type Equipment = {
  paidCents: number;
  version: number;
  serialNumber: string;
  estimatedExitDate: string | null;
  id: number;
  orderNumber: string;
  invoiceNumber: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  equipmentType: string;
  assignedTechnician: string;
  brand: string;
  model: string;
  accessories: string;
  reportedIssue: string;
  diagnosis: string;
  damageNotes: string;
  partsDescription: string;
  partsCostCents: number;
  laborDescription: string;
  laborCostCents: number;
  status: Status;
  entryDate: string;
  exitDate: string | null;
  invoiceTotalCents: number | null;
  warrantyDays: number;
  notes: string;
};

const statusLabel: Record<Status, string> = {
  ingreso: "Ingreso",
  diagnostico: "Diagnóstico",
  reparacion: "En reparación",
  listo: "Listo",
  entregado: "Entregado",
  anulado: "Anulado",
};

/** Los tipos que ofrece el alta y la corrección. Una sola lista, no dos. */
const EQUIPMENT_TYPES = [
  "Celular",
  "Laptop",
  "Computadora",
  "Impresora",
  "Tablet",
  "Monitor",
  "Otro",
];

const statusOptions = Object.entries(statusLabel) as [Status, string][];
const PAGE_SIZE = 100;
const EMAIL_INPUT_PATTERN = "[^\\s@]+@(?:[^\\s@.]+\\.)+[^\\s@.]{2,63}";

const today = todayInPanama;

function createInitialForm() {
  return {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    equipmentType: "Celular",
    assignedTechnician: "",
    brand: "",
    model: "",
    serialNumber: "",
    estimatedExitDate: "",
    warrantyDays: "30",
    accessories: "",
    reportedIssue: "",
    damageNotes: "",
    entryDate: today(),
  };
}

type RegistryClientProps = {
  role: Role;
  previewLabel?: string | null;
  userEmail: string;
  signOutPath: string | null;
  business: BusinessInfo;
};

type ApiError = {
  code?: string;
  error?: string;
  detail?: string;
};

function apiErrorMessage(data: ApiError, fallback: string) {
  const message = data.error || fallback;
  return data.detail ? `${message} Detalle: ${data.detail}` : message;
}

// Solo cierra cuando el clic empezó en el fondo y no dentro del diálogo, en
// vez de colgar un stopPropagation en el diálogo mismo. Escape también cierra,
// vía useModal.
function closeOnBackdrop(onClose: () => void) {
  return (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
}

type ServerSummary = {
  total: number;
  statusCounts: Partial<Record<Status, number>>;
  monthRevenueCents: number;
};

const LOAD_ERROR = "No se pudieron cargar los registros.";

// La sesión es una cookie HttpOnly, así que cerrarla es una llamada al servidor
// y no un enlace: el cliente no puede borrar la cookie por su cuenta.
async function signOut(path: string) {
  try {
    await fetch(path, { method: "DELETE" });
  } finally {
    window.location.reload();
  }
}

function loadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : LOAD_ERROR;
}

type PageQuery = {
  technician: string;
  entryFrom: string;
  entryTo: string;
  search: string;
  status: "todos" | Status;
  cursor?: string | null;
  signal?: AbortSignal;
};

async function fetchPage({ search, status, cursor, signal, technician, entryFrom, entryTo }: PageQuery) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    status,
  });
  if (search) params.set("search", search);
  if (technician) params.set("technician", technician);
  if (entryFrom) params.set("entryFrom", entryFrom);
  if (entryTo) params.set("entryTo", entryTo);
  if (cursor) params.set("cursor", cursor);

  const response = await fetch(`/api/equipment?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  const data = await response.json() as {
    technicians?: string[];
    equipment?: Equipment[];
    total?: number;
    nextCursor?: string | null;
    summary?: ServerSummary;
  } & ApiError;
  if (!response.ok) throw new Error(apiErrorMessage(data, LOAD_ERROR));

  const equipment = data.equipment || [];
  return {
    equipment,
    total: data.total ?? equipment.length,
    nextCursor: data.nextCursor ?? null,
    summary: data.summary ?? null,
    technicians: data.technicians ?? [],
  };
}

export default function RegistryClient({ previewLabel, userEmail, signOutPath, business, role }: RegistryClientProps) {
  // La sesión se renueva sola mientras esta pantalla esté abierta.
  useSessionRenewal(signOutPath === "/api/session");
  const [records, setRecords] = useState<Equipment[]>([]);
  const [currentDate, setCurrentDate] = useState(today);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [serverSummary, setServerSummary] = useState<ServerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Un aviso sabe si trae buenas o malas noticias. Antes era solo texto y
  // todos salían en el verde de "listo": un error de guardado se leía como
  // una confirmación.
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | Status>("todos");
  const [technician, setTechnician] = useState("");
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [entryFrom, setEntryFrom] = useState("");
  const [entryTo, setEntryTo] = useState("");
  const [conflictId, setConflictId] = useState<number | null>(null);
  const [detailReload, setDetailReload] = useState(0);
  const [receipt, setReceipt] = useState<Equipment | null>(null);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryRefresh, setInventoryRefresh] = useState(0);
  const [stockAlerts, setStockAlerts] = useState<number | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loadedQueryKey, setLoadedQueryKey] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<Equipment | null>(null);
  const [invoice, setInvoice] = useState<Equipment | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(createInitialForm);
  const [initialForm, setInitialForm] = useState(form);
  const newDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/inventory?low=1", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { summary?: { lowStock: number } };
        if (!controller.signal.aborted) setStockAlerts(response.ok ? data.summary?.lowStock ?? null : null);
      } catch { if (!controller.signal.aborted) setStockAlerts(null); }
    })();
    return () => controller.abort();
  }, [inventoryRefresh]);
  useUnsavedChanges(newOpen && (newDirty || saving));
  function closeNewRecord() {
    if (saving || (newDirty && !confirmDiscardChanges())) return;
    const empty = createInitialForm();
    setInitialForm(empty);
    setForm(empty);
    setNewOpen(false);
  }
  const newModalRef = useModal(closeNewRecord);
  const queryKey = `${filter}\u0000${debouncedSearch}\u0000${technician}\u0000${entryFrom}\u0000${entryTo}\u0000${refreshVersion}`;
  const queryKeyRef = useRef(queryKey);
  const loadMoreRequestIdRef = useRef(0);
  const loadMoreRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);

  useEffect(() => {
    queryKeyRef.current = queryKey;
  }, [queryKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    // Al cambiar búsqueda o estado se descarta la página anterior. AbortController
    // evita además que una respuesta lenta sobrescriba una consulta más nueva.
    const controller = new AbortController();
    let cancelled = false;
    const requestedKey = queryKey;
    void (async () => {
      // Se difiere un microtask para que los cambios de estado no sean una
      // cascada síncrona desde el cuerpo del efecto.
      await Promise.resolve();
      if (cancelled) return;
      loadMoreRequestRef.current?.controller.abort();
      loadMoreRequestRef.current = null;
      setLoading(true);
      setLoadingMore(false);
      setRecords([]);
      setTotal(0);
      setNextCursor(null);
      setLoadedQueryKey("");
      try {
        const {
          equipment: incoming,
          total: loadedTotal,
          nextCursor: incomingCursor,
          summary, technicians: incomingTechnicians,
        } = await fetchPage({
          search: debouncedSearch,
          status: filter, technician, entryFrom, entryTo,
          signal: controller.signal,
        });
        if (cancelled) return;
        setRecords(incoming);
        setTotal(loadedTotal);
        setNextCursor(incomingCursor);
        setServerSummary(summary);
        setTechnicians(incomingTechnicians);
        setLoadedQueryKey(requestedKey);
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setNotice({ text: loadErrorMessage(error), error: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      loadMoreRequestRef.current?.controller.abort();
      loadMoreRequestRef.current = null;
    };
  }, [debouncedSearch, filter, queryKey, technician, entryFrom, entryTo]);

  async function loadMore() {
    if (!nextCursor || loadMoreRequestRef.current) return;
    const requestedKey = queryKeyRef.current;
    const requestedCursor = nextCursor;
    const requestId = ++loadMoreRequestIdRef.current;
    const controller = new AbortController();
    loadMoreRequestRef.current = { id: requestId, controller };
    setLoadingMore(true);
    try {
      const {
        equipment: incoming,
        total: loadedTotal,
        nextCursor: incomingCursor,
        summary,
      } = await fetchPage({
        search: debouncedSearch,
        status: filter, technician, entryFrom, entryTo,
        cursor: requestedCursor,
        signal: controller.signal,
      });
      if (
        loadMoreRequestRef.current?.id !== requestId ||
        queryKeyRef.current !== requestedKey
      ) return;
      setRecords((current) => {
        const loadedIds = new Set(current.map((record) => record.id));
        return [...current, ...incoming.filter((record) => !loadedIds.has(record.id))];
      });
      setTotal(loadedTotal);
      setNextCursor(incomingCursor);
      setServerSummary(summary);
    } catch (error) {
      if (
        loadMoreRequestRef.current?.id === requestId &&
        queryKeyRef.current === requestedKey &&
        !controller.signal.aborted
      ) {
        setNotice({ text: loadErrorMessage(error), error: true });
      }
    } finally {
      if (loadMoreRequestRef.current?.id === requestId) {
        loadMoreRequestRef.current = null;
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    const refreshDate = () => setCurrentDate(today());
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshDate();
    };
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  // Los contadores y lo facturado del mes vienen agregados en SQL sobre toda la
  // tabla. Calcularlos aquí solo veía la página cargada, así que pasando
  // PAGE_SIZE órdenes quedaban por debajo del valor real.
  const summary = useMemo(() => {
    const counts = serverSummary?.statusCounts ?? {};
    const statusCounts: Record<Status, number> = {
      ingreso: counts.ingreso ?? 0,
      diagnostico: counts.diagnostico ?? 0,
      reparacion: counts.reparacion ?? 0,
      listo: counts.listo ?? 0,
      entregado: counts.entregado ?? 0,
      anulado: counts.anulado ?? 0,
    };
    const globalTotal = serverSummary?.total ?? Object.values(statusCounts)
      .reduce((sum, value) => sum + value, 0);
    return {
      statusCounts,
      ...summarizeStatusCounts(statusCounts, globalTotal),
      readyCount: statusCounts.listo,
      monthRevenueCents: serverSummary?.monthRevenueCents ?? 0,
    };
  }, [serverSummary]);

  const { statusCounts, activeCount, liveTotal, readyCount, monthRevenueCents } = summary;
  const hasMore = Boolean(nextCursor) &&
    loadedQueryKey === queryKey &&
    search.trim() === debouncedSearch &&
    !loading;
  const emptyIsNoMatch = Boolean(technician || entryFrom || entryTo || debouncedSearch) || filter !== "todos" ||
    (serverSummary?.total ?? 0) > 0;

  function openNewRecord() {
    setNotice(null);
    const empty = createInitialForm();
    setInitialForm(empty);
    setForm(empty);
    setNewOpen(true);
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/equipment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { equipment?: Equipment } & ApiError;
      if (!response.ok || !data.equipment) throw new Error(apiErrorMessage(data, "No se pudo guardar el ingreso."));
      setForm(createInitialForm());
      setNewOpen(false);
      setReceipt(data.equipment);
      // La consulta actual decide si la orden nueva debe verse. Recargar desde
      // el servidor también actualiza los contadores globales y la facturación.
      setRefreshVersion((current) => current + 1);
      setNotice({ text: `${data.equipment.orderNumber} se registró correctamente.`, error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "No se pudo guardar el ingreso.", error: true });
    } finally { setSaving(false); }
  }

  async function updateRecord(id: number, values: Record<string, unknown>, openInvoice = false, openDetailAfterUpdate = true) {
    if (saving) return;
    const current = detail?.id === id ? detail : records.find(record => record.id === id);
    if (!current) return;
    const confirmation = equipmentChangeConfirmation(current, values);
    if (confirmation && !window.confirm(confirmation)) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/equipment", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, id, version: current.version }) });
      const data = await response.json() as { equipment?: Equipment } & ApiError;
      if (!response.ok || !data.equipment) {
        if (data.code === "ORDER_CONFLICT") { setConflictId(id); if (!detail) setDetail(current); }
        throw new Error(apiErrorMessage(data, "No se pudo actualizar el registro."));
      }
      setConflictId(null);
      const updated = data.equipment;
      setRecords((current) => current.map((record) => record.id === id ? updated : record));
      if (openDetailAfterUpdate) setDetail(updated);
      if (openInvoice) { setDetail(null); setInvoice(updated); }
      // Un cambio de estado puede sacar la fila del filtro y alterar todas las
      // métricas. La respuesta de PATCH no contiene esos agregados.
      setRefreshVersion((current) => current + 1);
      setNotice({ text: openInvoice ? "Salida registrada. La factura no fiscal está lista." : "Registro actualizado.", error: false });
      return updated;
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "No se pudo actualizar el registro.", error: true });
    } finally { setSaving(false); }
  }

  async function reloadLatestDetail() {
    if (!detail || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/equipment/detail?id=${detail.id}`, { cache: "no-store" });
      const data = await response.json() as { equipment?: Equipment } & ApiError;
      if (!response.ok || !data.equipment) throw new Error(data.error || "No se pudo cargar la orden actual.");
      setDetail(data.equipment); setDetailReload(value => value + 1); setConflictId(null);
      setRefreshVersion(value => value + 1); setNotice(null);
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "No se pudo cargar la orden actual." }); }
    finally { setSaving(false); }
  }

  function handleStatusChange(record: Equipment, event: ChangeEvent<HTMLSelectElement>) {
    const nextStatus = event.currentTarget.value as Status;
    event.currentTarget.value = record.status;

    void updateRecord(record.id, { status: nextStatus }, false, false);
  }

  return (
    <main className="app-shell">
      {previewLabel && <div className="preview-banner" role="note">{previewLabel}</div>}
      <header className="topbar">
        <div className="brand">
          <Image className="brand-logo" src="/pacific-tech-logo.png" alt="Pacific Tech Pa" width={148} height={48} priority />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-subtitle">Centro de servicio</span>
        </div>
        <div className="topbar-actions">
          <div className="account-menu">
            <span title={userEmail}>{userEmail} · {roleLabels[role]}</span>
            {signOutPath?.startsWith("/signout-with-chatgpt") ? (
              <a className="sign-out" href={signOutPath} target="_top">Cerrar sesión</a>
            ) : signOutPath ? (
              <button className="sign-out" onClick={() => void signOut(signOutPath)}>Cerrar sesión</button>
            ) : null}
          </div>
          {/* Abre en pestaña nueva: se consulta un precio mientras se atiende
              una orden, y perder el formulario a medio llenar sería peor que
              tener dos pestañas. */}
          <a className="secondary-button" href="/precios/" target="_blank" rel="noopener noreferrer">Precios de repuestos</a>
          <button className="secondary-button" onClick={() => setReportsOpen(true)}>Indicadores y reportes</button>
          <button className="secondary-button" onClick={() => setInventoryOpen(true)}>Inventario{Boolean(stockAlerts) && <span className="stock-count" aria-label={`${stockAlerts} repuestos con stock bajo`}>{stockAlerts}</span>}</button>
          {can(role, "receive") && <button className="primary-button" onClick={openNewRecord}><span>＋</span> Nuevo ingreso</button>}
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">CONTROL DE SERVICIO TÉCNICO</p>
          <h1>Registro de equipos</h1>
          <p className="hero-copy">Un solo lugar para controlar ingresos, reparaciones, costos y entregas.</p>
          <details className="access-help"><summary>Mi acceso: {roleLabels[role]}</summary><p>Administrador: todas las operaciones y anulación de pagos. Recepción: ingresos, importes, entregas, inventario y cobros. Técnico: diagnóstico, avance del trabajo, notas y repuestos de órdenes. Solo lectura: consulta de registros e informes.</p><p>Los permisos se asignan a cuentas verificadas. Una cuenta sin rol asignado queda en solo lectura.</p></details>
        </div>
        <div className="date-chip"><span>Hoy</span><strong>{formatDate(currentDate)}</strong></div>
      </section>

      <section className="metrics" aria-label="Resumen de operaciones">
        <article className="metric"><div className="metric-icon blue">⌁</div><div><span>Equipos activos</span><strong>{activeCount}</strong><small>En el taller</small></div></article>
        <article className="metric"><div className="metric-icon amber">✓</div><div><span>Listos para entregar</span><strong>{readyCount}</strong><small>Esperando al cliente</small></div></article>
        <article className="metric"><div className="metric-icon cyan">$</div><div><span>Facturado este mes</span><strong>{formatMoney(monthRevenueCents)}</strong><small>Facturas no fiscales</small></div></article>
      </section>

      {role === "admin" && <BackupDownload />}
      {notice && <div className={notice.error ? "notice error" : "notice"} role={notice.error ? "alert" : "status"}><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Cerrar mensaje">×</button></div>}

      <section className="records-card">
        <div className="records-head">
          <div><h2>Órdenes de servicio</h2><p>{records.length} de {total} resultados cargados</p></div>
          <div className="records-tools">
            <label className="search"><span aria-hidden="true">⌕</span><input aria-label="Buscar" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar orden, cliente o equipo" /></label>
            <div className="records-tool-buttons">
              {(search || filter !== "todos" || technician || entryFrom || entryTo) && <button className="ghost-button" onClick={() => { setSearch(""); setDebouncedSearch(""); setFilter("todos"); setTechnician(""); setEntryFrom(""); setEntryTo(""); }}>Limpiar filtros</button>}
              <button className="secondary-button" disabled={loading || saving} onClick={() => setRefreshVersion(value => value + 1)}>{loading ? "Actualizando…" : "Actualizar"}</button>
            </div>
          </div>
        </div>
        <details className="tracking-disclosure">
          <summary>
            <span>Filtros por técnico y fecha</span>
            {(technician || entryFrom || entryTo) && <span className="filter-active-count">{[technician, entryFrom, entryTo].filter(Boolean).length} activos</span>}
          </summary>
          {(technician || entryFrom || entryTo) && <p className="active-filter-description">{[technician, entryFrom && `Desde ${formatDate(entryFrom)}`, entryTo && `Hasta ${formatDate(entryTo)}`].filter(Boolean).join(" · ")}</p>}
          <div className="tracking-filters" role="group" aria-label="Filtrar por técnico y fecha de ingreso">
          <label>Técnico<select value={technician} onChange={event => setTechnician(event.target.value)}><option value="">Todos los técnicos</option>{Array.from(new Set([...technicians, ...(technician ? [technician] : [])])).map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <label>Ingreso desde<input type="date" value={entryFrom} max={entryTo || undefined} onChange={event => setEntryFrom(event.target.value)} /></label>
          <label>Ingreso hasta<input type="date" value={entryTo} min={entryFrom || undefined} onChange={event => setEntryTo(event.target.value)} /></label>
          <small>Las métricas superiores y los contadores por estado muestran el total general.</small>
          </div>
        </details>
        <div className="tabs" role="group" aria-label="Filtrar por estado">
          <button aria-pressed={filter === "todos"} className={filter === "todos" ? "active" : ""} onClick={() => setFilter("todos")}>Todos <b>{liveTotal}</b></button>
          {statusOptions.map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label} <b>{statusCounts[value]}</b></button>)}
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Orden</th><th>Cliente</th><th>Equipo</th><th>Técnico</th><th>Ingreso / plazo</th><th>Estado</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td><button className="order-link" onClick={() => setDetail(record)}>{record.orderNumber}</button><small>{formatDate(record.entryDate)}</small></td>
                  <td><strong>{record.customerName}</strong><small>{record.customerPhone || record.customerEmail || "Sin contacto"}</small></td>
                  <td><strong>{record.equipmentType}</strong><small>{[record.brand, record.model].filter(Boolean).join(" · ") || "Sin marca/modelo"}</small></td>
                  <td><strong>{record.assignedTechnician || "Sin asignar"}</strong></td>
                  <td>{formatDate(record.entryDate)}{record.status !== "anulado" && <small>{workshopDays(record.entryDate, currentDate, record.exitDate)} días {record.status === "entregado" ? "hasta entrega" : "en taller"}</small>}{record.estimatedExitDate && <small className={record.status !== "entregado" && record.status !== "anulado" && record.estimatedExitDate < currentDate ? "overdue" : ""}>Estimada: {formatDate(record.estimatedExitDate)}{record.status !== "entregado" && record.status !== "anulado" && record.estimatedExitDate < currentDate ? " · Vencida" : ""}</small>}</td>
                  <td><select className={`status status-control ${record.status}`} value={record.status} disabled={saving || !can(role, "edit") || (role === "tecnico" && ["entregado", "anulado"].includes(record.status))} onChange={(event) => handleStatusChange(record, event)} aria-label={`Cambiar estado de ${record.orderNumber}`}>{statusOptions.map(([value, label]) => <option disabled={role === "tecnico" && ["entregado", "anulado"].includes(value)} key={value} value={value}>{label}</option>)}</select></td>
                  <td><strong>{formatMoney(record.status === "entregado" ? record.invoiceTotalCents : calculateTotals(record.partsCostCents, record.laborCostCents).totalCents)}</strong><small>{balance(record).label} · Saldo {formatMoney(balance(record).dueCents)}</small></td>
                  <td><button className="row-action" onClick={() => record.status === "entregado" ? setInvoice(record) : setDetail(record)} aria-label={`Abrir ${record.orderNumber}`}>›</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && records.length === 0 && <div className="empty"><div>＋</div><h3>{emptyIsNoMatch ? "No hay coincidencias" : "Registra tu primer equipo"}</h3><p>{emptyIsNoMatch ? "Prueba con otra búsqueda o estado." : "Los ingresos aparecerán aquí con su estado y costos."}</p>{!emptyIsNoMatch && can(role, "receive") && <button className="secondary-button" onClick={openNewRecord}>Crear primer ingreso</button>}</div>}
          {loading && <div className="empty"><div className="spinner"/><p>Cargando registros…</p></div>}
        </div>
        {hasMore && <div className="load-more"><button className="secondary-button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Cargando…" : "Cargar más"}</button></div>}
      </section>

      {newOpen && <div className="modal-backdrop" role="presentation" onMouseDown={closeOnBackdrop(closeNewRecord)}><section ref={newModalRef} className="drawer" aria-modal="true" role="dialog" aria-labelledby="new-title">
        <div className="drawer-head"><div><p className="eyebrow">NUEVA ORDEN</p><h2 id="new-title">Registrar ingreso</h2></div><button className="close" onClick={closeNewRecord} aria-label="Cerrar">×</button></div>
        <form onSubmit={createRecord} className="entry-form">
          {notice?.error && <p className="field-error" role="alert">{notice.text}</p>}
          <fieldset disabled={saving}><legend>Datos del cliente</legend><div className="form-grid">
            <label className="wide">Nombre o empresa *<input data-autofocus type="text" required maxLength={EQUIPMENT_TEXT_FIELDS.customerName.max} autoComplete="name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Ej. Ana Rodríguez" /></label>
            <label>Teléfono<input type="tel" inputMode="numeric" autoComplete="tel" minLength={CUSTOMER_PHONE_MIN_LENGTH} maxLength={CUSTOMER_PHONE_MAX_LENGTH} pattern="[0-9]{7,15}" title="Ingresa únicamente números, entre 7 y 15 dígitos." aria-describedby="phone-hint" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: keepPhoneDigits(e.target.value) })} placeholder="60000000" /><small id="phone-hint" className="field-hint">Solo números, sin espacios ni guiones.</small></label>
            <label>Correo<input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={CUSTOMER_EMAIL_MAX_LENGTH} pattern={EMAIL_INPUT_PATTERN} title="Usa un formato como cliente@correo.com." aria-describedby="email-hint" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} placeholder="cliente@correo.com" /><small id="email-hint" className="field-hint">Debe incluir @ y un dominio, por ejemplo .com.</small></label>
          </div></fieldset>
          <fieldset disabled={saving}><legend>Equipo recibido</legend><div className="form-grid">
            <label>Tipo de equipo *<select value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })}>{EQUIPMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Fecha de ingreso<input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} /></label>
            <label className="wide">Técnico asignado<input type="text" maxLength={EQUIPMENT_TEXT_FIELDS.assignedTechnician.max} value={form.assignedTechnician} onChange={(e) => setForm({ ...form, assignedTechnician: e.target.value })} placeholder="Nombre del técnico o Sin asignar" /></label>
            <label>Marca<input type="text" maxLength={EQUIPMENT_TEXT_FIELDS.brand.max} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ej. Lenovo" /></label>
            <label>Modelo<input type="text" maxLength={EQUIPMENT_TEXT_FIELDS.model.max} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Ej. ThinkPad E14" /></label>
            <label className="wide">Serial / IMEI (opcional)<input maxLength={EQUIPMENT_TEXT_FIELDS.serialNumber.max} value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} placeholder="Número de serie o IMEI del equipo" /></label>
            <label>Entrega estimada<input type="date" min={form.entryDate || undefined} value={form.estimatedExitDate} onChange={e => setForm({ ...form, estimatedExitDate: e.target.value })} /></label>
            <label>Garantía del servicio (días)<input type="number" required min="0" max="3650" step="1" value={form.warrantyDays} onChange={e => setForm({ ...form, warrantyDays: e.target.value })} /></label>
            <label className="wide">Accesorios recibidos<input type="text" maxLength={EQUIPMENT_TEXT_FIELDS.accessories.max} value={form.accessories} onChange={(e) => setForm({ ...form, accessories: e.target.value })} placeholder="Cargador, bolso, cable USB…" /></label>
            <label className="wide">Falla reportada *<textarea required maxLength={EQUIPMENT_TEXT_FIELDS.reportedIssue.max} value={form.reportedIssue} onChange={(e) => setForm({ ...form, reportedIssue: e.target.value })} placeholder="Describe lo que reporta el cliente" /></label>
            <label className="wide">Daños visibles al ingreso<textarea maxLength={EQUIPMENT_TEXT_FIELDS.damageNotes.max} value={form.damageNotes} onChange={(e) => setForm({ ...form, damageNotes: e.target.value })} placeholder="Golpes, rayones, piezas faltantes…" /></label>
          </div></fieldset>
          <div className="form-actions"><button type="button" className="ghost-button" onClick={closeNewRecord}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar ingreso"}</button></div>
        </form>
      </section></div>}

      {detail && <DetailDrawer role={role} key={`${detail.id}:${detailReload}`} onInventoryChanged={() => setInventoryRefresh(value => value + 1)} company={business.legalName} conflict={conflictId === detail.id} onReload={reloadLatestDetail} onShowReceipt={() => { setDetail(null); setReceipt(detail); }} record={detail} saving={saving} errorMessage={notice?.error ? notice.text : null} onClose={() => { setDetail(null); setConflictId(null); }} onUpdate={updateRecord} onInvoice={(values) => updateRecord(detail.id, { ...values, status: "entregado", exitDate: today() }, true)} onShowInvoice={() => { setDetail(null); setInvoice(detail); }} />}
      {inventoryOpen && <InventoryPanel role={role} onClose={() => setInventoryOpen(false)} onChanged={() => setInventoryRefresh(value => value + 1)} />}
      {reportsOpen && <EquipmentReports technicians={technicians} company={business.legalName} onClose={() => setReportsOpen(false)} />}
      {receipt && <ReceptionReceipt record={receipt} business={business} onClose={() => setReceipt(null)} />}
      {invoice && <InvoiceModal record={invoice} business={business} onClose={() => setInvoice(null)} />}
    </main>
  );
}

function DetailDrawer({ role, record, saving, errorMessage, onClose, onUpdate, onInvoice, onShowInvoice, conflict, onReload, onShowReceipt, company, onInventoryChanged }: { role: Role; onInventoryChanged: () => void; company: string; conflict: boolean; onReload: () => Promise<void>; onShowReceipt: () => void; record: Equipment; saving: boolean; errorMessage: string | null; onClose: () => void; onUpdate: (id: number, values: Record<string, unknown>) => Promise<Equipment | undefined>; onInvoice: (values: Record<string, unknown>) => Promise<Equipment | undefined>; onShowInvoice: () => void }) {
  const [draft, setDraft] = useState(() => ({
    ...record,
    laborDescription:
      record.laborDescription === DEFAULT_LABOR_DESCRIPTION
        ? ""
        : record.laborDescription,
  }));
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactDirty, setContactDirty] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryDirty, setInventoryDirty] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentDirty, setPaymentDirty] = useState(false);
  const editable = can(role, "edit") && !(role === "tecnico" && ["entregado", "anulado"].includes(record.status));
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentDirty, setAttachmentDirty] = useState(false);
  const busy = saving || noteSaving || contactSaving || inventoryBusy || paymentBusy || attachmentBusy;
  const [warrantyInput, setWarrantyInput] = useState(String(record.warrantyDays));
  const warrantyValid = /^\d+$/.test(warrantyInput) && Number(warrantyInput) <= 3650;
  const [partsCostInput, setPartsCostInput] = useState(centsToDollarInput(record.partsCostCents));
  const [laborCostInput, setLaborCostInput] = useState(centsToDollarInput(record.laborCostCents));
  const partsCostCents = dollarsToCents(partsCostInput);
  const laborCostCents = dollarsToCents(laborCostInput);
  const costsValid = partsCostCents !== null && laborCostCents !== null && partsCostCents + laborCostCents <= MAX_MONEY_CENTS;
  const totals = calculateTotals(partsCostCents ?? 0, laborCostCents ?? 0);
  const updateValues = costsValid && warrantyValid
    ? {
        status: draft.status,
        assignedTechnician: draft.assignedTechnician,
        diagnosis: draft.diagnosis,
        partsDescription: draft.partsDescription,
        partsCostCents,
        laborDescription: draft.laborDescription,
        laborCostCents,
        serialNumber: draft.serialNumber,
        estimatedExitDate: draft.estimatedExitDate || null,
        warrantyDays: Number(warrantyInput),
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        customerEmail: draft.customerEmail,
        equipmentType: draft.equipmentType,
        entryDate: draft.entryDate,
        brand: draft.brand,
        model: draft.model,
        accessories: draft.accessories,
        reportedIssue: draft.reportedIssue,
        damageNotes: draft.damageNotes,
      }
    : null;
  const orderDirty = !updateValues || Object.entries(updateValues).some(([key, value]) => {
    const original = key === "laborDescription" && record.laborDescription === DEFAULT_LABOR_DESCRIPTION
      ? "" : record[key as keyof Equipment];
    return value !== original;
  });
  const dirty = orderDirty || inventoryDirty || contactDirty || paymentDirty || attachmentDirty || Boolean(note.trim());
  useUnsavedChanges(dirty || busy);
  function requestClose() {
    if (busy || (dirty && !confirmDiscardChanges())) return;
    onClose();
  }
  function showSavedInvoice() {
    if (busy || (dirty && !confirmDiscardChanges())) return;
    onShowInvoice();
  }
  async function saveChanges() {
    if (!updateValues) return;
    const submitted = role === "tecnico" ? Object.fromEntries(Object.entries(updateValues).filter(([key]) => technicianFields.has(key))) : updateValues;
    const updated = await onUpdate(record.id, submitted);
    if (!updated) return;
    setDraft({ ...updated, laborDescription: updated.laborDescription === DEFAULT_LABOR_DESCRIPTION ? "" : updated.laborDescription });
    setWarrantyInput(String(updated.warrantyDays));
    setPartsCostInput(centsToDollarInput(updated.partsCostCents));
    setLaborCostInput(centsToDollarInput(updated.laborCostCents));
  }
  const modalRef = useModal(requestClose);
  return <div className="modal-backdrop" role="presentation" onMouseDown={closeOnBackdrop(requestClose)}><section ref={modalRef} className="drawer detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <div className="drawer-head"><div><p className="eyebrow">{record.orderNumber}</p><h2 id="detail-title">{record.equipmentType} {record.brand}</h2><span className={`status ${record.status}`}>{statusLabel[record.status]}</span></div><button className="close" onClick={requestClose} aria-label="Cerrar">×</button></div>
    <div className="customer-strip"><div className="avatar">{record.customerName.slice(0, 2).toUpperCase()}</div><div><strong>{record.customerName}</strong><span>{record.customerPhone || record.customerEmail || "Sin contacto"}</span></div></div>
    <fieldset disabled={busy} className="detail-body" aria-label="Datos de la orden" style={{ border: 0, margin: 0, minWidth: 0 }}>
      {errorMessage && <p className="field-error" role="alert">{errorMessage}</p>}
      {conflict && <div className="conflict-message" role="alert"><strong>Esta orden tiene cambios más recientes.</strong><p>Puedes copiar tus cambios antes de cargar la versión actual. Al cargarla se reemplazará este formulario.</p><button type="button" className="secondary-button" onClick={() => { if (!dirty || confirmDiscardChanges()) void onReload(); }}>Cargar versión actual</button></div>}
      <button type="button" className="secondary-button" onClick={() => { if (!dirty || confirmDiscardChanges()) onShowReceipt(); }}>Comprobante de ingreso</button>
      <a className="secondary-button" href={`/cliente?orden=${record.id}`} target="_blank" rel="noopener noreferrer">Vista del cliente (privada)</a>
      <div className="detail-facts"><span><b>Modelo</b>{record.model || "-"}</span><span><b>Ingreso</b>{formatDate(record.entryDate)}</span><span><b>Accesorios</b>{record.accessories || "Ninguno"}</span></div>
      <div className="issue"><b>Falla reportada</b><p>{record.reportedIssue}</p>{record.damageNotes && <small>Daños visibles: {record.damageNotes}</small>}</div>
      <label>Técnico asignado<input disabled={!editable || role === "tecnico"} maxLength={EQUIPMENT_TEXT_FIELDS.assignedTechnician.max} value={draft.assignedTechnician} onChange={(e) => setDraft({ ...draft, assignedTechnician: e.target.value })} placeholder="Sin asignar" /></label>
      <label>Estado<select disabled={!editable} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>{statusOptions.map(([value, label]) => <option disabled={role === "tecnico" && ["entregado", "anulado"].includes(value)} key={value} value={value}>{label}</option>)}</select></label>
      <div className="form-grid"><label>Entrega estimada<input disabled={!editable} type="date" min={draft.entryDate || undefined} value={draft.estimatedExitDate || ""} onChange={e => setDraft({ ...draft, estimatedExitDate: e.target.value || null })} /></label><label>Garantía del servicio (días)<input disabled={!editable || role === "tecnico"} type="number" min="0" max="3650" step="1" value={warrantyInput} onChange={e => setWarrantyInput(e.target.value)} /></label></div>
      {!warrantyValid && <p className="field-error" role="alert">La garantía debe ser un número entero de 0 a 3650 días.</p>}
      <label>Diagnóstico / trabajo realizado<textarea disabled={!editable} maxLength={EQUIPMENT_TEXT_FIELDS.diagnosis.max} value={draft.diagnosis} onChange={(e) => setDraft({ ...draft, diagnosis: e.target.value })} placeholder="Resultado del diagnóstico y solución aplicada" /></label>
      {/* Plegado por defecto: corregir un ingreso es la excepción, no el uso
          diario, y desplegado empujaría los costos fuera de la pantalla. */}
      <details className="edit-entry">
        <summary>Corregir datos del ingreso</summary>
        <fieldset disabled={!editable || role === "tecnico"} className="form-grid">
          <label className="wide">Nombre o empresa *<input maxLength={EQUIPMENT_TEXT_FIELDS.customerName.max} value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} /></label>
          <label>Teléfono<input type="tel" inputMode="numeric" minLength={CUSTOMER_PHONE_MIN_LENGTH} maxLength={CUSTOMER_PHONE_MAX_LENGTH} pattern="[0-9]{7,15}" title="Solo números, entre 7 y 15 dígitos." value={draft.customerPhone} onChange={(e) => setDraft({ ...draft, customerPhone: keepPhoneDigits(e.target.value) })} /></label>
          <label>Correo<input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={CUSTOMER_EMAIL_MAX_LENGTH} pattern={EMAIL_INPUT_PATTERN} title="Usa un formato como cliente@correo.com." value={draft.customerEmail} onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} /></label>
          <label>Tipo de equipo *<select value={draft.equipmentType} onChange={(e) => setDraft({ ...draft, equipmentType: e.target.value })}>{EQUIPMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Fecha de ingreso<input type="date" value={draft.entryDate} onChange={(e) => setDraft({ ...draft, entryDate: e.target.value })} /></label>
          <label>Marca<input maxLength={EQUIPMENT_TEXT_FIELDS.brand.max} value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></label>
          <label>Modelo<input maxLength={EQUIPMENT_TEXT_FIELDS.model.max} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} /></label>
          <label className="wide">Serial / IMEI (opcional)<input maxLength={EQUIPMENT_TEXT_FIELDS.serialNumber.max} value={draft.serialNumber} onChange={e => setDraft({ ...draft, serialNumber: e.target.value })} /></label>
          <label className="wide">Accesorios recibidos<input maxLength={EQUIPMENT_TEXT_FIELDS.accessories.max} value={draft.accessories} onChange={(e) => setDraft({ ...draft, accessories: e.target.value })} /></label>
          <label className="wide">Falla reportada *<textarea maxLength={EQUIPMENT_TEXT_FIELDS.reportedIssue.max} value={draft.reportedIssue} onChange={(e) => setDraft({ ...draft, reportedIssue: e.target.value })} /></label>
          <label className="wide">Daños visibles al ingreso<textarea maxLength={EQUIPMENT_TEXT_FIELDS.damageNotes.max} value={draft.damageNotes} onChange={(e) => setDraft({ ...draft, damageNotes: e.target.value })} /></label>
        </fieldset>
      </details>

      <fieldset disabled={!editable} className="cost-box"><h3>Costos del servicio</h3><label>Descripción de piezas<input maxLength={EQUIPMENT_TEXT_FIELDS.partsDescription.max} value={draft.partsDescription} onChange={(e) => setDraft({ ...draft, partsDescription: e.target.value })} placeholder="Pieza o repuesto utilizado" /></label><label className="money-field">Precio de piezas<input disabled={role === "tecnico"} type="number" min="0" step="0.01" inputMode="decimal" aria-invalid={partsCostCents === null} value={partsCostInput} onChange={(e) => setPartsCostInput(e.target.value)} /></label><label>Descripción de mano de obra<input maxLength={EQUIPMENT_TEXT_FIELDS.laborDescription.max} value={draft.laborDescription} onChange={(e) => setDraft({ ...draft, laborDescription: e.target.value })} placeholder="Ej. Diagnóstico, instalación o limpieza" /></label><label className="money-field">Mano de obra<input disabled={role === "tecnico"} type="number" min="0" step="0.01" inputMode="decimal" aria-invalid={laborCostCents === null} value={laborCostInput} onChange={(e) => setLaborCostInput(e.target.value)} /></label>{!costsValid && <p className="field-error" role="alert">Ingresa montos válidos, mayores o iguales a cero y con máximo dos decimales y un total de hasta $21,474,836.47.</p>}{costsValid && <div className="cost-summary"><div className="total-row"><span>Total estimado</span><strong>{formatMoney(totals.totalCents)}</strong></div></div>}</fieldset>
    </fieldset>
    <OrderAttachments equipmentId={record.id} disabled={saving || noteSaving || contactSaving || inventoryBusy || paymentBusy} canUpload={can(role, "note")} onBusy={setAttachmentBusy} onDirty={setAttachmentDirty} onSaved={() => setHistoryRefresh(v => v + 1)} />
    <OrderPayments equipmentId={record.id} role={role} disabled={attachmentBusy || attachmentDirty || saving || noteSaving || contactSaving || inventoryBusy || orderDirty || inventoryDirty || contactDirty || Boolean(note.trim())} onBusy={setPaymentBusy} onDirty={setPaymentDirty} onSaved={onReload} />
    <OrderInventory equipmentId={record.id} status={record.status} disabled={attachmentBusy || saving || noteSaving || contactSaving || paymentBusy || !can(role, "consume")} onBusy={setInventoryBusy} onDirty={setInventoryDirty} onChanged={() => { setHistoryRefresh(value => value + 1); onInventoryChanged(); }} />
    <CustomerContact record={record} company={company} disabled={attachmentBusy || saving || noteSaving || inventoryBusy || paymentBusy || !can(role, "note")} onBusyChange={setContactSaving} onDirtyChange={setContactDirty} onSaved={() => setHistoryRefresh(value => value + 1)} />
    <EquipmentHistory equipmentId={record.id} version={record.version + historyRefresh} legacyNote={record.notes} note={note} onNoteChange={setNote} disabled={attachmentBusy || saving || contactSaving || inventoryBusy || paymentBusy || !can(role, "note")} onBusyChange={setNoteSaving} />
    {dirty && <p className="unsaved-hint" role="status">Cambios sin guardar</p>}
    <div className="drawer-actions"><button className="secondary-button" disabled={busy || conflict || !updateValues || !editable} onClick={() => void saveChanges()}>Guardar cambios</button>{record.status !== "entregado" ? <button className="primary-button" disabled={busy || conflict || !updateValues || !can(role, "receive")} onClick={() => { if (updateValues && ((!note.trim() && !contactDirty && !inventoryDirty && !paymentDirty && !attachmentDirty) || confirmDiscardChanges())) void onInvoice(updateValues); }}>Registrar salida y facturar</button> : <button className="primary-button" disabled={busy} onClick={showSavedInvoice}>Ver factura</button>}</div>
  </section></div>;
}

function InvoiceModal({ record, business, onClose }: { record: Equipment; business: BusinessInfo; onClose: () => void }) {
  const modalRef = useModal(onClose);
  const [emailStatus, setEmailStatus] = useState<{ message: string; error: boolean } | null>(null);

  function emailInvoice() {
    const href = buildInvoiceEmailHref(record, business);
    if (!href) {
      setEmailStatus({
        message: "Esta orden no tiene un correo válido. Registra el correo del cliente para poder enviarle la factura.",
        error: true,
      });
      return;
    }

    setEmailStatus({
      message: `Factura preparada para ${record.customerEmail}. Revisa el mensaje y presiona Enviar en tu aplicación de correo.`,
      error: false,
    });
    window.location.href = href;
  }

  return <div ref={modalRef} className="invoice-backdrop" role="dialog" aria-modal="true" aria-labelledby="invoice-title"><div className="invoice-toolbar"><button data-autofocus className="ghost-button" onClick={onClose}>← Volver</button><span id="invoice-title">Vista previa de factura no fiscal</span><div className="invoice-actions"><button className="secondary-button" onClick={emailInvoice}>Enviar por correo</button><button className="primary-button" onClick={() => window.print()}>Imprimir / PDF</button></div></div>{emailStatus && <div className={`invoice-email-status${emailStatus.error ? " error" : ""}`} role="status">{emailStatus.message}</div>}<article className="invoice-page">
    <header className="invoice-header"><div className="invoice-company"><Image className="invoice-logo" src="/pacific-tech-logo.png" alt="Pacific Tech Pa" width={132} height={70} /><div><strong>{business.legalName}</strong><span>RUC: {business.taxId}</span>{business.addressLines.map((line) => <span key={line}>{line}</span>)}<span>{contactLine(business)}</span></div></div><div className="invoice-number"><small>FACTURA NO FISCAL</small><strong>{record.invoiceNumber || `NF-${String(record.id).padStart(7, "0")}`}</strong><span>Emitida el: {formatDate(record.exitDate || today())}</span></div></header>
    <section className="invoice-client"><div><small>CLIENTE</small><strong>{record.customerName}</strong><span>{record.customerEmail || record.customerPhone || "Consumidor final"}</span></div><div><small>ORDEN DE SERVICIO</small><strong>{record.orderNumber}</strong><span>{record.equipmentType} {[record.brand, record.model].filter(Boolean).join(" ")}</span></div></section>
    <table className="invoice-table"><thead><tr><th>Producto o servicio</th><th>Cantidad</th><th>Precio</th><th>Total</th></tr></thead><tbody>{record.partsCostCents > 0 && <tr><td><strong>{record.partsDescription || "Piezas y repuestos"}</strong><span>{record.equipmentType}</span></td><td>1</td><td>{formatMoney(record.partsCostCents)}</td><td>{formatMoney(record.partsCostCents)}</td></tr>}<tr><td><strong>{record.laborDescription || "Servicio técnico / mano de obra"}</strong><span>{record.diagnosis || record.reportedIssue}</span></td><td>1</td><td>{formatMoney(record.laborCostCents)}</td><td>{formatMoney(record.laborCostCents)}</td></tr></tbody></table>
    <div className="invoice-totals"><div className="grand-total"><span>Precio total</span><strong>{formatMoney(record.invoiceTotalCents)}</strong></div></div>
    <section className="invoice-notes"><div><h4>Formas de pago</h4><p>{business.paymentMethods.map((method, index) => <Fragment key={method}>{index > 0 && <br/>}{method}</Fragment>)}</p></div><div><h4>Términos y garantía</h4><p>El cliente declara haber respaldado su información. Los equipos y servicios se consideran aceptados al momento de la entrega. Se ofrece garantía de {record.warrantyDays} días sobre el servicio técnico realizado. No cubre daños por mal uso, golpes, humedad, variaciones eléctricas, manipulación por terceros ni fallas no relacionadas con el servicio prestado.</p></div></section>
    <footer className="invoice-footer"><span>Documento no fiscal · Gracias por confiar en {business.legalName}</span><strong>{business.website}</strong></footer>
  </article></div>;
}
