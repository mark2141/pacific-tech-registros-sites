"use client";

import { useEffect, useState } from "react";
import type { Equipment } from "./registry-client";
import { customerMessage, customerEmailHref, messageTemplates, whatsappHref, whatsappRecipient, type MessageTemplate } from "../lib/customer-message";

export function CustomerContact({ record, company, disabled, onBusyChange, onDirtyChange, onSaved }: {
  record: Equipment; company: string; disabled: boolean; onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void; onSaved: () => void;
}) {
  const [template, setTemplate] = useState<MessageTemplate>(record.status === "listo" ? "listo" : record.status === "entregado" ? "finalizado" : "recibido");
  const [message, setMessage] = useState(() => customerMessage(record, company, template));
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [phone, setPhone] = useState(() => whatsappRecipient(record.customerPhone));
  const [email, setEmail] = useState(record.customerEmail);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ error: boolean; message: string } | null>(null);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const recipient = channel === "whatsapp" ? phone : email;
  const href = channel === "whatsapp" ? whatsappHref(phone, message) : customerEmailHref(email, record.orderNumber, message);
  const valid = Boolean(href && message.trim() && message.trim().length <= 1500);
  function chooseTemplate(value: MessageTemplate) {
    if (dirty && !window.confirm("¿Reemplazar el mensaje preparado por esta plantilla?")) return;
    setTemplate(value); setMessage(customerMessage(record, company, value)); setDirty(true); setResult(null);
  }
  async function recordContact() {
    if (!valid || saving || disabled) return;
    setSaving(true); onBusyChange(true); setResult(null);
    try {
      const response = await fetch("/api/equipment/history", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentId: record.id, kind: "contacto", template, channel, recipient, message }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo registrar el contacto.");
      setDirty(false); setResult({ error: false, message: "Contacto registrado en el historial." }); onSaved();
    } catch (error) { setResult({ error: true, message: error instanceof Error ? error.message : "No se pudo registrar el contacto." }); }
    finally { setSaving(false); onBusyChange(false); }
  }
  return <details className="customer-contact"><summary>Contactar al cliente</summary><fieldset disabled={disabled || saving}>
    <p className="field-hint">Las plantillas usan los datos guardados. Revisa el mensaje y envíalo desde tu aplicación; después registra el contacto realizado.</p>
    <label>Mensaje<select value={template} onChange={event => chooseTemplate(event.target.value as MessageTemplate)}>{Object.entries(messageTemplates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Canal<select value={channel} onChange={event => { setChannel(event.target.value as "email" | "whatsapp"); setDirty(true); }}><option value="whatsapp">WhatsApp</option><option value="email">Correo</option></select></label>
    {channel === "whatsapp" ? <label>Número con código de país<input type="tel" inputMode="numeric" maxLength={15} value={phone} onChange={event => { setPhone(event.target.value.replace(/\D/g, "")); setDirty(true); }} /><small className="field-hint">Panamá: 507 seguido del número. Confirma el destinatario antes de abrir WhatsApp.</small></label> : <label>Correo del destinatario<input type="email" maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setDirty(true); }} /></label>}
    <label>Texto para revisar<textarea maxLength={1500} rows={8} value={message} onChange={event => { setMessage(event.target.value); setDirty(true); }} /></label>
    <div className="contact-actions">{valid && !disabled && !saving ? <a className="secondary-button" href={href!} target="_blank" rel="noopener noreferrer">Abrir {channel === "whatsapp" ? "WhatsApp" : "correo"}</a> : <button type="button" className="secondary-button" disabled>Abrir {channel === "whatsapp" ? "WhatsApp" : "correo"}</button>}<button type="button" className="primary-button" disabled={!valid || disabled || saving} onClick={() => void recordContact()}>{saving ? "Registrando…" : "Registrar contacto realizado"}</button></div>
    {!valid && <p className="field-hint">Completa un destinatario válido y el texto del mensaje.</p>}
    {result && <p className={result.error ? "field-error" : "field-hint"} role={result.error ? "alert" : "status"}>{result.message}</p>}
  </fieldset></details>;
}
