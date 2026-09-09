import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../../db";
import { canAccessOrder } from "../../lib/permissions";
import type { EquipmentActor } from "../../lib/equipment-repository";
import { attachments, equipmentHistory,equipment } from "../../db/schema";
import type { AttachmentInput } from "../../lib/attachments";
export async function getAttachment(id: number) { const [row] = await getDb().select().from(attachments).where(eq(attachments.id, id)); return row ?? null; }
export async function findAttachment(operationId: string) { const [row] = await getDb().select().from(attachments).where(eq(attachments.operationId, operationId)); return row ?? null; }
export async function listAttachments(equipmentId: number, before?: number) {
  const rows = await getDb().select().from(attachments).where(and(eq(attachments.equipmentId, equipmentId), before ? lt(attachments.id, before) : undefined)).orderBy(desc(attachments.id)).limit(26);
  return { attachments: rows.slice(0,25), nextCursor: rows.length > 25 ? rows[24].id : null };
}
export async function createAttachment(input: AttachmentInput,actor?:EquipmentActor) {
  return getDb().transaction(async tx => {
    if(actor){const [order]=await tx.select().from(equipment).where(eq(equipment.id,input.equipmentId)).for("update");if(!canAccessOrder(actor,order))return null;}
    const [row] = await tx.insert(attachments).values(input).onConflictDoNothing({ target: attachments.operationId }).returning();
    if (!row) return null;
    await tx.insert(equipmentHistory).values({ equipmentId: input.equipmentId, kind: "adjunto", message: `Archivo #${row.id} · ${input.stage} · ${input.filename}: ${input.caption}`, actorUserId: input.actorUserId, actorEmail: input.actorEmail });
    return row;
  });
}
