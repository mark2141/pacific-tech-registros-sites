import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
const origin=new URL(process.argv[2]||"http://localhost:5173").origin;
if(!["localhost","127.0.0.1"].includes(new URL(origin).hostname))throw new Error("Solo pruebas locales.");
const login=await fetch(origin+"/signin-with-chatgpt?return_to=/",{redirect:"manual"}),cookie=login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
async function request(path,method="GET",body){const response=await fetch(origin+path,{method,headers:{Cookie:cookie,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};}
const sql=command=>execFileSync(process.execPath,["node_modules/wrangler/bin/wrangler.js","d1","execute","DB","--local","--config","wrangler.sites.json","--command",command],{stdio:"pipe",env:{...process.env,WRANGLER_SEND_METRICS:"false",WRANGLER_LOG_PATH:".wrangler/logs"}});
const users=await request("/api/users");assert.equal(users.status,200,JSON.stringify(users.body));const self=users.body.users.find(u=>u.email==="seedy@sites.test");assert.ok(self.protected);
const modify=(user,patch)=>request("/api/users","PATCH",{...user,...patch});
assert.equal((await modify(self,{role:"lectura"})).status,403);assert.equal((await modify(self,{enabled:0})).status,403);
const name=`Técnico ${Date.now()}`,added=await request("/api/users","POST",{email:`tech-${Date.now()}@example.test`,name,role:"tecnico",enabled:1});assert.equal(added.status,201);let technician=added.body.user;
assert.equal((await request("/api/users","POST",technician)).status,409);
const edited=await modify(technician,{name:name+" A"});assert.equal(edited.status,200);assert.equal((await modify(technician,{enabled:0})).status,409);technician=edited.body.user;
const orderBody={customerName:"Roles ficticios",equipmentType:"Laptop",reportedIssue:"Prueba local",assignedMemberId:technician.id};
const a=await request("/api/equipment","POST",orderBody),b=await request("/api/equipment","POST",orderBody);assert.equal(a.status,201);assert.equal(b.status,201);let own=a.body.equipment;const other=b.body.equipment;
assert.equal(own.assignedMemberId,technician.id);assert.equal(own.assignedTechnician,technician.name);
await request("/api/equipment","PATCH",{id:own.id,version:own.version,laborCostCents:9955});own=(await request(`/api/equipment/detail?id=${own.id}`)).body.equipment;
const item=(await request("/api/inventory","POST",{sku:`ROLE-${Date.now()}`,name:"Prueba",supplier:"Proveedor",unitCostCents:7722,minimumStock:0,initialStock:3})).body.item;
try{
  sql(`UPDATE equipment SET assigned_member_id=${self.id} WHERE id=${own.id}; UPDATE staff SET role='tecnico' WHERE id=${self.id}`);
  const page=await request("/api/equipment?limit=100&status=todos");assert.equal(page.status,200);assert.equal(page.body.total,1);assert.equal(page.body.summary.total,1);assert.deepEqual(page.body.equipment.map(r=>r.id),[own.id]);
  for(const key of ["laborCostCents","partsCostCents","paidCents","invoiceTotalCents"])assert.equal(page.body.equipment[0][key],undefined);assert.equal(page.body.summary.monthRevenueCents,undefined);
  for(const path of [`/api/equipment/detail?id=${other.id}`,`/api/equipment/history?equipmentId=${other.id}`,`/api/equipment/attachments?equipmentId=${other.id}`,`/api/inventory/movements?equipmentId=${other.id}`])assert.equal((await request(path)).status,404,path);
  for(const path of ["/api/users","/api/backup","/api/equipment/reports","/api/equipment/export",`/api/equipment/payments?equipmentId=${own.id}`,`/api/inventory/movements?itemId=${item.id}`])assert.equal((await request(path)).status,403,path);
  const catalog=await request(`/api/inventory?itemId=${item.id}`);assert.equal(catalog.body.item.unitCostCents,undefined);
  const movement={operationId:crypto.randomUUID(),itemId:item.id,version:item.version,equipmentId:other.id,kind:"consumo",quantity:1,note:"Prueba"};
  assert.equal((await request("/api/inventory/movements","POST",movement)).status,404);
  const consumed=await request("/api/inventory/movements","POST",{...movement,equipmentId:own.id});assert.equal(consumed.status,200);assert.equal(consumed.body.item.unitCostCents,undefined);assert.equal(consumed.body.movement.unitCostCents,undefined);
  assert.equal((await request("/api/equipment","PATCH",{id:other.id,version:other.version,diagnosis:"No permitido"})).status,404);
  assert.equal((await request("/api/equipment","PATCH",{id:own.id,version:own.version,laborCostCents:1})).status,403);
  assert.equal((await request("/api/equipment","PATCH",{id:own.id,version:own.version,diagnosis:"Trabajo permitido"})).status,200);
  assert.equal((await request("/api/equipment/history","POST",{equipmentId:other.id,message:"No permitido"})).status,404);
  assert.equal((await request("/api/equipment/history","POST",{equipmentId:own.id,message:"Nota técnica"})).status,201);
  sql(`UPDATE staff SET role='lectura' WHERE id=${self.id}`);
  const readOnly=await request(`/api/equipment/detail?id=${other.id}`);assert.equal(readOnly.status,200);assert.equal(readOnly.body.equipment.partsCostCents,undefined);
  assert.equal((await request("/api/equipment/history","POST",{equipmentId:own.id,message:"No permitido"})).status,403);
  sql(`UPDATE staff SET enabled=0 WHERE id=${self.id}`);assert.equal((await request("/api/equipment")).status,403);
}finally{
  sql(`UPDATE staff SET role='admin',enabled=1 WHERE id=${self.id}`);
  for(const id of [own.id,other.id]){const row=(await request(`/api/equipment/detail?id=${id}`)).body.equipment;await request("/api/equipment","PATCH",{id,version:row.version,status:"anulado"});}
  await modify(technician,{enabled:0});
}
console.log("OK D1: administrador protegido, gestión y conflictos, asignación por cuenta, métricas propias, rutas aisladas, importes ocultos y bloqueo de sesiones.");
