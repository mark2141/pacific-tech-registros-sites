import { getTableColumns } from "drizzle-orm";
import { equipment, equipmentHistory, inventoryItems, inventoryMovements, payments, attachments } from "../db/sites-schema";
// Application-owned identifiers only. Same physical columns on both platforms.
export const backupTables = Object.entries({equipment,equipment_history:equipmentHistory,inventory_items:inventoryItems,inventory_movements:inventoryMovements,payments,attachments}).map(([name,table])=>({name,columns:Object.values(getTableColumns(table)).map(column=>column.name)}));
export const MAX_BACKUP_BYTES = 2_000_000;
