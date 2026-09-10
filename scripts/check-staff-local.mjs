import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
const origin=new URL(process.argv[2]||"http://localhost:5173").origin;
if(!["localhost","127.0.0.1"].includes(new URL(origin).hostname))throw new Error("Solo pruebas locales.");
const login=await fetch(origin+"/signin-with-chatgpt?return_to=/",{redirect:"manual"}),cookie=login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
async function request(path,method="GET",body){const response=await fetch(origin+path,{method,headers:{Cookie:cookie,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};}
const sql=command=>execFileSync(process.execPath,["node_modules/wrangler/bin/wrangler.js","d1","execute","DB","--local","--config","wrangler.sites.json","--command",command],{stdio:"pipe",env:{...process.env,WRANGLER_SEND_METRICS:"false",WRANGLER_LOG_PATH:".wrangler/logs"}});
const users=await request("/api/users");assert.equal(users.status,200,JSON.stringify(users.body));const self=users.body.users.find(u=>u.email==="seedy@sites.test");assert.ok(self.protected);
const tag="ROLES-"+Date.now(), ids=[], accounts=[];
const modify=(user,patch)=>request("/api/users","PATCH",{...user,...patch});
try {
 assert.equal((await modify(self,{role:"tecnico",technicianName:"Anthony"})).status,403);assert.equal((await modify(self,{enabled:0})).status,403);
 const names=(await request("/api/users?technicians=1")).body.technicians.map(row=>row.name);assert.deepEqual(names,["Anthony","Marcos","Valentín","Xavier"]);
 assert.equal((await request("/api/users","POST",{email:tag+"@example.test",name:"T",role:"recepcion",enabled:1})).status,400);
 const added=await request("/api/users","POST",{email:tag+"@example.test",name:"Prueba Anthony",technicianName:"Anthony",role:"tecnico",enabled:1});assert.equal(added.status,201,JSON.stringify(added.body));const tech=added.body.user;accounts.push(tech);
 assert.equal((await request("/api/users","POST",{...tech,email:tag+"-2@example.test"})).status,409);
 assert.equal((await request("/api/users","POST",{...tech,technicianName:null,email:tag+"-3@example.test"})).status,400);
 async function create(name="Sin asignar"){const result=await request("/api/equipment","POST",{customerName:tag,equipmentType:"Tablet",brand:"Lenovo",model:"M10",reportedIssue:tag,assignedTechnician:name});assert.equal(result.status,201,JSON.stringify(result.body));ids.push(result.body.equipment.id);return result.body.equipment;}
 let open=await create(),reserved=await create("Valentín"),other=await create("Anthony"),blocked=await create("Xavier");
 assert.equal(open.invoiceKind,"technician");assert.equal(other.assignedMemberId,tech.id);assert.equal(blocked.assignedMemberId,null);
 sql("UPDATE staff SET role='tecnico',technician_name='Valentín' WHERE id="+self.id);
 const available=await request("/api/equipment?view=available&search="+tag);assert.equal(available.status,200,JSON.stringify(available.body));assert.deepEqual(available.body.equipment.map(r=>r.id).sort((a,b)=>a-b),[open.id,reserved.id]);
 assert.equal(available.body.equipment[0].customerName,undefined);assert.equal(available.body.equipment[0].laborCostCents,undefined);
 const claim=order=>request("/api/equipment/claim","POST",{id:order.id,version:order.version,assignedMemberId:tech.id,assignedTechnician:"Anthony"});
 assert.equal((await claim(blocked)).status,409);
 const race=await Promise.all([claim(open),claim(open)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);open=race.find(r=>r.status===200).body.equipment;assert.equal(open.assignedMemberId,self.id);assert.equal(open.assignedTechnician,"Valentín");assert.equal(open.status,"reparacion");
 const own=await request("/api/equipment?search="+tag);assert.deepEqual(own.body.equipment.map(r=>r.id),[open.id]);
 for(const path of ["/api/equipment/detail?id="+other.id,"/api/equipment/history?equipmentId="+other.id,"/api/equipment/attachments?equipmentId="+other.id,"/api/inventory/movements?equipmentId="+other.id])assert.equal((await request(path)).status,404,path);
 for(const path of ["/api/users","/api/backup","/api/equipment/reports","/api/equipment/export","/api/equipment/payments?equipmentId="+open.id])assert.equal((await request(path)).status,403,path);
 assert.equal((await request("/api/equipment","PATCH",{id:open.id,version:open.version,partsCostCents:7000})).status,403);
 const work=await request("/api/equipment","PATCH",{id:open.id,version:open.version,diagnosis:"Reparada",laborDescription:"Cambio de conector",laborCostCents:2500,status:"listo"});assert.equal(work.status,200,JSON.stringify(work.body));open=work.body.equipment;assert.equal(open.laborCostCents,2500);assert.equal(open.partsCostCents,undefined);
 sql("UPDATE staff SET role='admin',technician_name=NULL WHERE id="+self.id);
 const billed=await request("/api/equipment","PATCH",{id:open.id,version:open.version,partsCostCents:9000,status:"entregado"});assert.equal(billed.status,200,JSON.stringify(billed.body));open=billed.body.equipment;assert.equal(open.invoiceTotalCents,2500);assert.equal(open.invoiceTechnician,"Valentín");
 assert.equal((await request("/api/equipment","PATCH",{id:open.id,version:open.version,assignedTechnician:"Anthony"})).status,400);
 sql("UPDATE staff SET role='tecnico',technician_name='Valentín' WHERE id="+self.id);
 const invoice=(await request("/api/equipment/detail?id="+open.id)).body.equipment;assert.equal(invoice.invoiceTotalCents,2500);assert.equal(invoice.invoiceTechnician,"Valentín");assert.equal(invoice.partsCostCents,undefined);
 sql("UPDATE staff SET role='recepcion' WHERE id="+self.id);assert.equal((await request("/api/equipment")).status,403);
 sql("UPDATE staff SET role='tecnico',enabled=0 WHERE id="+self.id);assert.equal((await request("/api/equipment")).status,403);
}finally{
 sql("UPDATE staff SET role='admin',enabled=1,technician_name=NULL WHERE id="+self.id);
 for(const id of ids)sql("UPDATE equipment SET status='anulado',invoice_number=NULL,invoice_total_cents=NULL,assigned_member_id=NULL WHERE id="+id);
 for(const account of accounts){const latest=(await request("/api/users")).body.users.find(row=>row.id===account.id);await modify(latest,{enabled:0,technicianName:null});}
}
console.log("OK D1: dos roles, cuatro nombres, vinculación única, reclamo concurrente, órdenes propias, mano de obra e importe de factura, legado bloqueado y protección administrativa.");
