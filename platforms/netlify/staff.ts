import { and,desc,eq,lt } from "drizzle-orm";
import { getDb } from "../../db";
import { staff,staffAudit } from "../../db/schema";
import { visibleStaff,protectStaff,StaffError,type Staff,type StaffInput } from "../../lib/staff";
import { TECHNICIANS } from "../../lib/technicians";
import type { Role } from "../../lib/permissions";
export async function getStaff(id:number){const [row]=await getDb().select().from(staff).where(eq(staff.id,id));return row as Staff|undefined;}
export async function ensureStaff(email:string,role:Role|null){
  const db=getDb();const [existing]=await db.select().from(staff).where(eq(staff.email,email));if(existing)return visibleStaff(existing as Staff);
  await db.insert(staff).values({email,name:email,role:role??"tecnico",protected:role==="admin"?1:0,enabled:role==="admin"?1:0}).onConflictDoNothing();
  const [row]=await db.select().from(staff).where(eq(staff.email,email));return row as Staff;
}
export async function listStaff(before?:number){const rows=await getDb().select().from(staff).where(before?lt(staff.id,before):undefined).orderBy(desc(staff.id)).limit(51);return{users:(rows.slice(0,50) as Staff[]).map(visibleStaff),nextCursor:rows.length>50?rows[49].id:null};}
export async function listTechnicians(){const rows=await getDb().select({id:staff.id,name:staff.technicianName}).from(staff).where(and(eq(staff.enabled,1)));return TECHNICIANS.map(name=>({name,id:rows.find(row=>row.name===name)?.id??null}));}
export async function saveStaff(input:StaffInput,actor:{memberId:number;email:string},id?:number,version?:number){return getDb().transaction(async tx=>{
  let row;
  if(id){const [current]=await tx.select().from(staff).where(eq(staff.id,id)).for("update");if(!current||current.version!==version)throw new StaffError("La cuenta cambió. Recarga los usuarios.",409);protectStaff(current as Staff,input,actor.memberId);[row]=await tx.update(staff).set({...input,version:current.version+1}).where(eq(staff.id,id)).returning();}
  else{[row]=await tx.insert(staff).values(input).onConflictDoNothing().returning();if(!row)throw new StaffError("Ya existe una cuenta con ese correo.",409);}
  await tx.insert(staffAudit).values({staffId:row.id,message:`${id?"Actualización":"Alta"}: ${input.email} · ${input.role} · ${input.technicianName||"Sin vincular"} · ${input.enabled?"Activa":"Bloqueada"}`,actorEmail:actor.email});return row as Staff;
});}
export async function listStaffAudit(){return getDb().select().from(staffAudit).orderBy(desc(staffAudit.id)).limit(50);}
