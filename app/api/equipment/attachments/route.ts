import { getAuthUser } from "../../../auth";
import { can } from "../../../../lib/permissions";
import { getEquipment } from "../../../equipment-access";
import { createAttachment, findAttachment, getAttachment, listAttachments } from "@platform/attachments";
import { putFile, getFile, deleteFile } from "@platform/files";
import { attachmentParams, attachmentType, AttachmentError, readAttachment, sameAttachment, type AttachmentRow } from "../../../../lib/attachments";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, {status, headers});
const visible = (row: AttachmentRow) => ({ id: row.id, equipmentId: row.equipmentId, filename: row.filename, contentType: row.contentType, size: row.size, stage: row.stage, caption: row.caption, createdAt: row.createdAt, actorEmail: row.actorEmail });
function id(value: string | null) { if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 2147483647) throw new AttachmentError("Identificador inválido."); return Number(value); }
function failure(error: unknown) {
  if (error instanceof AttachmentError) return json({error: error.message}, error.status);
  console.error("Error de adjuntos:", error); return json({error:"No se pudo completar la operación. Puedes reintentar el mismo archivo."},500);
}
export async function GET(request: Request) {
  try {
    if (!await getAuthUser()) return json({error:"Acceso denegado."},403);
    const params = new URL(request.url).searchParams;
    if (params.has("id")) {
      const row = await getAttachment(id(params.get("id"))); if (!row||!await getEquipment(row.equipmentId)) return json({error:"No se encontró el archivo."},404);
      const bytes = await getFile(row.objectKey); if (!bytes) return json({error:"El archivo no está disponible. Contacta al administrador."},404);
      const inline = params.get("preview") === "1" && row.contentType.startsWith("image/");
      const filename = encodeURIComponent(row.filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
      return new Response(bytes, {headers:{...headers,"Content-Type":row.contentType,"Content-Length":String(bytes.byteLength),"Content-Disposition":`${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,"Content-Security-Policy":"sandbox; default-src 'none'"}});
    }
    const equipmentId = id(params.get("equipmentId")); if (!await getEquipment(equipmentId)) return json({error:"No se encontró la orden."},404);
    const page = await listAttachments(equipmentId,params.has("before") ? id(params.get("before")) : undefined);
    return json({...page,attachments:page.attachments.map(visible)});
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(); if (!user || !can(user.role,"note")) return json({error:"Tu rol no permite adjuntar archivos."},403);
    const params = attachmentParams(new URL(request.url).searchParams);
    if (!await getEquipment(params.equipmentId)) return json({error:"No se encontró la orden."},404);
    const bytes = await readAttachment(request), contentType = attachmentType(bytes, request.headers.get("content-type") || "", params.filename);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
    const input = {...params,contentType,size:bytes.length,sha256,objectKey:`orders/${params.equipmentId}/${crypto.randomUUID()}`,actorUserId:user.userId,actorEmail:user.email};
    const previous = await findAttachment(input.operationId);
    if (previous) { if (!sameAttachment(previous,input)) throw new AttachmentError("La operación ya corresponde a otro archivo.",409); return json({attachment:visible(previous),replayed:true}); }
    await putFile(input.objectKey,bytes.buffer);
    // A failed database response can be ambiguous. Keep that inaccessible object
    // for recovery instead of deleting bytes whose metadata may have committed.
    const created = await createAttachment(input,user);
    if (created) return json({attachment:visible(created),replayed:false},201);
    const winner = await findAttachment(input.operationId);
    if (!winner) throw new Error("No se encontró el resultado del adjunto.");
    await deleteFile(input.objectKey); // distinct random key; never the winner's bytes
    if (!sameAttachment(winner,input)) throw new AttachmentError("La operación ya corresponde a otro archivo.",409);
    return json({attachment:visible(winner),replayed:true});
  } catch(error) { return failure(error); }
}
