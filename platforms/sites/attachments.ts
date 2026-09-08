import { getSitesDb } from "./database";
import type { AttachmentInput, AttachmentRow } from "../../lib/attachments";
const selection = `id, operation_id AS "operationId", equipment_id AS "equipmentId", object_key AS "objectKey", filename, content_type AS "contentType", size, sha256, stage, caption, actor_user_id AS "actorUserId", actor_email AS "actorEmail", created_at AS "createdAt"`;
export async function getAttachment(id: number) { return getSitesDb().prepare(`SELECT ${selection} FROM attachments WHERE id = ?`).bind(id).first<AttachmentRow>(); }
export async function findAttachment(operationId: string) { return getSitesDb().prepare(`SELECT ${selection} FROM attachments WHERE operation_id = ?`).bind(operationId).first<AttachmentRow>(); }
export async function listAttachments(equipmentId: number, before?: number) {
  const rows = await getSitesDb().prepare(`SELECT ${selection} FROM attachments WHERE equipment_id = ? ${before ? "AND id < ?" : ""} ORDER BY id DESC LIMIT 26`).bind(...(before ? [equipmentId,before] : [equipmentId])).all<AttachmentRow>();
  return { attachments: rows.results.slice(0,25), nextCursor: rows.results.length > 25 ? rows.results[24].id : null };
}
export async function createAttachment(input: AttachmentInput) {
  const db = getSitesDb(), now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(`INSERT INTO attachments (operation_id,equipment_id,object_key,filename,content_type,size,sha256,stage,caption,actor_user_id,actor_email,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING RETURNING ${selection}`)
      .bind(input.operationId,input.equipmentId,input.objectKey,input.filename,input.contentType,input.size,input.sha256,input.stage,input.caption,input.actorUserId,input.actorEmail,now),
    db.prepare(`INSERT INTO equipment_history (equipment_id,kind,message,actor_user_id,actor_email,created_at)
      SELECT ?, 'adjunto', 'Archivo #' || last_insert_rowid() || ?, ?, ?, ? WHERE changes() = 1`)
      .bind(input.equipmentId,` · ${input.stage} · ${input.filename}: ${input.caption}`,input.actorUserId,input.actorEmail,now),
  ]);
  return results[0].results[0] as AttachmentRow | undefined ?? null;
}
