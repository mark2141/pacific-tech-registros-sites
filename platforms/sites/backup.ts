import { getSitesDb } from "./database";
import { backupTables, MAX_BACKUP_BYTES } from "../../lib/backup-tables";
export async function exportRecords() {
  const db=getSitesDb();
  const expressions=backupTables.map(table=>({...table, row:`json_object(${table.columns.map(column=>`'${column}',"${column}"`).join(",")})`}));
  const size=expressions.map(table=>`COALESCE((SELECT SUM(length(CAST(${table.row} AS BLOB))) FROM "${table.name}"),0)`).join(" + ");
  // All reads share one D1 batch snapshot. Oversized exports return no data rows
  // rather than first loading an unbounded database into Worker memory.
  const results=await db.batch([db.prepare(`SELECT ${size} AS size`),...expressions.map(table=>db.prepare(`SELECT ${table.row} AS data FROM "${table.name}" WHERE (${size}) <= ? ORDER BY id`).bind(MAX_BACKUP_BYTES))]);
  if(Number((results[0].results[0] as {size:number}).size)>MAX_BACKUP_BYTES) return null;
  return Object.fromEntries(expressions.map((table,index)=>[table.name,(results[index+1].results as {data:string}[]).map(row=>JSON.parse(row.data))]));
}
