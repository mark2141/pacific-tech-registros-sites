export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const attachmentStages = { ingreso: "Ingreso", reparacion: "Reparación", entrega: "Entrega" } as const;
export type AttachmentInput = { operationId: string; equipmentId: number; filename: string; contentType: string; size: number; sha256: string; objectKey: string; stage: string; caption: string; actorUserId: string; actorEmail: string };
export type AttachmentRow = AttachmentInput & { id: number; createdAt: Date | string };
export class AttachmentError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function attachmentParams(params: URLSearchParams) {
  const equipmentId = Number(params.get("equipmentId"));
  const operationId = params.get("operationId") || "", stage = params.get("stage") || "";
  const filename = (params.get("filename") || "").trim(), caption = (params.get("caption") || "").trim();
  if (!Number.isInteger(equipmentId) || equipmentId < 1 || equipmentId > 2147483647) throw new AttachmentError("Orden inválida.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) throw new AttachmentError("Operación inválida.");
  if (!Object.hasOwn(attachmentStages, stage)) throw new AttachmentError("Selecciona la etapa de la evidencia.");
  if (!filename || filename.length > 150 || /[/\\]/.test(filename) || [...filename].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)) throw new AttachmentError("Nombre de archivo inválido (máximo 150 caracteres).");
  if (!/\.(jpe?g|png|webp|pdf)$/i.test(filename)) throw new AttachmentError("El archivo debe tener extensión JPG, PNG, WebP o PDF.");
  if (!caption || caption.length > 500) throw new AttachmentError("Añade una descripción de hasta 500 caracteres.");
  return { equipmentId, operationId: operationId.toLowerCase(), filename, caption, stage };
}
export async function readAttachment(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length")) > MAX_ATTACHMENT_BYTES) throw new AttachmentError("El archivo supera 3 MB.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new AttachmentError("Selecciona un archivo.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > MAX_ATTACHMENT_BYTES) { await reader.cancel(); throw new AttachmentError("El archivo supera 3 MB.", 413); } chunks.push(chunk.value); }
  } finally { reader.releaseLock(); }
  if (!size) throw new AttachmentError("El archivo está vacío.");
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
export function attachmentType(bytes: Uint8Array, declared: string, filename?: string) {
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const type = starts([255,216,255]) ? "image/jpeg" : starts([137,80,78,71,13,10,26,10]) ? "image/png" :
    starts([82,73,70,70]) && String.fromCharCode(...bytes.slice(8,12)) === "WEBP" ? "image/webp" : starts([37,80,68,70,45]) ? "application/pdf" : null;
  if (!type || declared.split(";")[0].trim() !== type) throw new AttachmentError("Admite JPG, PNG, WebP o PDF cuyo contenido coincida con el tipo de archivo.");
  const extensions = {"image/jpeg":/\.jpe?g$/i,"image/png":/\.png$/i,"image/webp":/\.webp$/i,"application/pdf":/\.pdf$/i};
  if (filename && !extensions[type].test(filename)) throw new AttachmentError("La extensión del archivo no coincide con su contenido.");
  return type;
}
export function sameAttachment(a: AttachmentInput, b: AttachmentInput) {
  return (["equipmentId", "filename", "contentType", "size", "sha256", "stage", "caption", "actorUserId"] as const).every(key => a[key] === b[key]);
}
