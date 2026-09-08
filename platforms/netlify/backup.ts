import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { backupTables, MAX_BACKUP_BYTES } from "../../lib/backup-tables";
export async function exportRecords() {
  return getDb().transaction(async tx=>{
    const size=backupTables.map(table=>`COALESCE((SELECT SUM(octet_length(row_to_json(t)::text)) FROM "${table.name}" t),0)`).join(" + ");
    const check=await tx.execute(sql.raw(`SELECT ${size} AS size`));
    if(Number(check.rows[0].size)>MAX_BACKUP_BYTES)return null;
    const result:Record<string,unknown[]>={};
    for(const table of backupTables){const rows=await tx.execute(sql.raw(`SELECT * FROM "${table.name}" ORDER BY id`));result[table.name]=rows.rows;}
    return result;
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
