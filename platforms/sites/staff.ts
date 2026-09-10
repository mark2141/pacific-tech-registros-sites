import { getSitesDb } from "./database";
import { visibleStaff,protectStaff,StaffError,type Staff,type StaffInput } from "../../lib/staff";
import { TECHNICIANS } from "../../lib/technicians";
import type { Role } from "../../lib/permissions";
const selection='id,email,name,technician_name AS "technicianName",role,enabled,protected,version';
export async function getStaff(id:number){return await getSitesDb().prepare(`SELECT ${selection} FROM staff WHERE id=?`).bind(id).first<Staff>()??undefined;}
export async function ensureStaff(email:string,role:Role|null){const db=getSitesDb();const existing=await db.prepare(`SELECT ${selection} FROM staff WHERE email=?`).bind(email).first<Staff>();if(existing)return visibleStaff(existing);
  await db.prepare('INSERT INTO staff(email,name,role,protected,enabled) VALUES(?,?,?,?,?) ON CONFLICT(email) DO NOTHING').bind(email,email,role??"tecnico",role==="admin"?1:0,role==="admin"?1:0).run();
  return (await db.prepare(`SELECT ${selection} FROM staff WHERE email=?`).bind(email).first<Staff>())!;
}
export async function listStaff(before?:number){const rows=(await getSitesDb().prepare(`SELECT ${selection} FROM staff ${before?'WHERE id<?':''} ORDER BY id DESC LIMIT 51`).bind(...(before?[before]:[])).all<Staff>()).results;return{users:rows.slice(0,50).map(visibleStaff),nextCursor:rows.length>50?rows[49].id:null};}
export async function listTechnicians(){const rows=(await getSitesDb().prepare("SELECT id,technician_name AS name FROM staff WHERE enabled=1 AND role IN ('admin','tecnico') AND technician_name IS NOT NULL").all<{id:number;name:string}>()).results;return TECHNICIANS.map(name=>({name,id:rows.find(row=>row.name===name)?.id??null}));}
export async function saveStaff(input:StaffInput,actor:{memberId:number;email:string},id?:number,version?:number){const db=getSitesDb();
  if(id){const current=await getStaff(id);if(!current||current.version!==version)throw new StaffError("La cuenta cambió. Recarga los usuarios.",409);protectStaff(current,input,actor.memberId);}
  const statement=id?db.prepare(`UPDATE staff SET name=?,technician_name=?,role=?,enabled=?,version=version+1 WHERE id=? AND version=? RETURNING ${selection}`).bind(input.name,input.technicianName,input.role,input.enabled,id,version!):db.prepare(`INSERT INTO staff(email,name,technician_name,role,enabled) VALUES(?,?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING ${selection}`).bind(input.email,input.name,input.technicianName,input.role,input.enabled);
  const results=await db.batch([statement,db.prepare(`INSERT INTO staff_audit(staff_id,message,actor_email,created_at) SELECT ${id?'?':'last_insert_rowid()'},?,?,? WHERE changes()=1`).bind(...(id?[id]:[]),`${id?"Actualización":"Alta"}: ${input.email} · ${input.role} · ${input.technicianName||"Sin vincular"} · ${input.enabled?"Activa":"Bloqueada"}`,actor.email,new Date().toISOString())]);
  const row=results[0].results[0] as Staff|undefined;if(!row)throw new StaffError("La cuenta ya existe o cambió. Recarga los usuarios.",409);return row;
}
export async function listStaffAudit(){return(await getSitesDb().prepare('SELECT id,staff_id AS "staffId",message,actor_email AS "actorEmail",created_at AS "createdAt" FROM staff_audit ORDER BY id DESC LIMIT 50').all()).results;}
