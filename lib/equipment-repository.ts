import type { equipment } from "../db/schema";
import type { parseEquipmentListQuery } from "./equipment-query";

export type EquipmentRow = typeof equipment.$inferSelect;
export type EquipmentListQuery = ReturnType<typeof parseEquipmentListQuery> & { scopeMemberId?:number };
export type NewEquipmentInput = Pick<EquipmentRow,
  "customerName" | "customerPhone" | "customerEmail" | "equipmentType" |
  "assignedTechnician" | "brand" | "model" | "accessories" | "reportedIssue" |
  "damageNotes" | "laborDescription" | "entryDate" | "notes" |
  "serialNumber" | "estimatedExitDate" | "warrantyDays"
> & {assignedMemberId?:number|null};

export type EquipmentActor = { userId: string; email: string; role?: import("./permissions").Role; memberId?:number };
