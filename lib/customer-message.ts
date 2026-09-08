import { isValidCustomerEmail } from "./contact-values.ts";
import { formatDate } from "./totals.ts";
import { InvalidEquipmentPayloadError } from "./equipment-validation.ts";

export const messageTemplates = {
  recibido: "Equipo recibido",
  listo: "Listo para retirar",
  finalizado: "Servicio finalizado",
} as const;
export type MessageTemplate = keyof typeof messageTemplates;
type MessageRecord = { customerName: string; orderNumber: string; equipmentType: string; brand: string; model: string; estimatedExitDate: string | null };

export function customerMessage(record: MessageRecord, company: string, template: MessageTemplate) {
  const equipment = [record.equipmentType, record.brand, record.model].filter(Boolean).join(" ");
  const text = template === "recibido"
    ? `Recibimos tu ${equipment} para revisión.${record.estimatedExitDate ? ` Entrega estimada: ${formatDate(record.estimatedExitDate)}.` : " Te informaremos cuando tengamos novedades."}`
    : template === "listo"
      ? `Tu ${equipment} está listo para retirar. Escríbenos para coordinar la entrega.`
      : `El servicio de tu ${equipment} ha finalizado. Gracias por confiar en nosotros. Si tienes alguna consulta, puedes responder este mensaje.`;
  return `Hola ${record.customerName},\n\n${text}\n\nOrden: ${record.orderNumber}\n${company}`;
}

export function whatsappRecipient(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 8 ? `507${digits}` : digits;
}

export function whatsappHref(recipient: string, message: string) {
  if (!/^[1-9]\d{7,14}$/.test(recipient)) return null;
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}

export function customerEmailHref(email: string, order: string, message: string) {
  if (!isValidCustomerEmail(email.trim())) return null;
  return `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(`Orden ${order.replace(/[\r\n]/g, " ")}`)}&body=${encodeURIComponent(message)}`;
}

export function contactEventMessage(payload: Record<string, unknown>) {
  const channel = payload.channel === "whatsapp" ? "WhatsApp" : payload.channel === "email" ? "Correo" : null;
  const template = typeof payload.template === "string" && Object.hasOwn(messageTemplates, payload.template) ? messageTemplates[payload.template as MessageTemplate] : null;
  const recipient = typeof payload.recipient === "string" ? payload.recipient.trim() : "";
  if (!channel || !template || (channel === "WhatsApp" ? !whatsappHref(recipient, "") : !isValidCustomerEmail(recipient))) {
    throw new InvalidEquipmentPayloadError("Revisa el canal, el destinatario y la plantilla del contacto.");
  }
  if (typeof payload.message !== "string" || !payload.message.trim() || payload.message.trim().length > 1500) {
    throw new InvalidEquipmentPayloadError("El mensaje debe tener entre 1 y 1500 caracteres.");
  }
  return `${channel} · ${template}\nDestinatario: ${recipient}\n${payload.message.trim()}`;
}
