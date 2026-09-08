"use client";

import Image from "next/image";
import type { Equipment } from "./registry-client";
import { contactLine, type BusinessInfo } from "../lib/business-info";
import { formatDate } from "../lib/totals";
import { useModal } from "./use-modal";

export function ReceptionReceipt({ record, business, onClose }: { record: Equipment; business: BusinessInfo; onClose: () => void }) {
  const modalRef = useModal(onClose);
  return <div ref={modalRef} className="invoice-backdrop" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
    <div className="invoice-toolbar"><button data-autofocus className="ghost-button" onClick={onClose}>← Volver</button><span id="receipt-title">Comprobante de ingreso</span><button className="primary-button" onClick={() => window.print()}>Imprimir / PDF</button></div>
    <article className="invoice-page receipt-page">
      <header className="invoice-header"><div className="invoice-company"><Image className="invoice-logo" src="/pacific-tech-logo.png" alt="Pacific Tech Pa" width={132} height={70} /><div><strong>{business.legalName}</strong>{business.addressLines.map(line => <span key={line}>{line}</span>)}<span>{contactLine(business)}</span></div></div><div className="invoice-number"><small>COMPROBANTE DE INGRESO</small><strong>{record.orderNumber}</strong><span>Ingreso: {formatDate(record.entryDate)}</span></div></header>
      <section className="invoice-client"><div><small>CLIENTE</small><strong>{record.customerName}</strong><span>{record.customerPhone || "Sin teléfono"}</span>{record.customerEmail && <span>{record.customerEmail}</span>}</div><div><small>EQUIPO RECIBIDO</small><strong>{record.equipmentType}</strong><span>{[record.brand, record.model].filter(Boolean).join(" · ") || "Sin marca / modelo"}</span><span>Serial / IMEI: {record.serialNumber || "No registrado"}</span></div></section>
      <div className="receipt-section"><h3>Accesorios recibidos</h3><p>{record.accessories || "Ninguno registrado"}</p></div>
      <div className="receipt-section"><h3>Falla reportada</h3><p>{record.reportedIssue}</p></div>
      <div className="receipt-section"><h3>Daños visibles al ingreso</h3><p>{record.damageNotes || "Sin observaciones registradas"}</p></div>
      <div className="receipt-section receipt-terms"><p><strong>Técnico asignado:</strong> {record.assignedTechnician}</p><p><strong>Entrega estimada:</strong> {record.estimatedExitDate ? formatDate(record.estimatedExitDate) : "Por confirmar"}</p><p><strong>Garantía del servicio:</strong> {record.warrantyDays} días desde la entrega, según las condiciones indicadas en la factura del servicio.</p><p>Este comprobante documenta los datos guardados de la orden. No acredita un pago ni sustituye la factura.</p></div>
      <div className="receipt-signatures"><div>Firma de quien recibe</div><div>Firma del cliente</div></div>
      <footer className="invoice-footer"><span>Comprobante de ingreso · No es una factura</span><strong>{business.website}</strong></footer>
    </article>
  </div>;
}
