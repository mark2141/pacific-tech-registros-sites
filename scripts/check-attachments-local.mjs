import assert from "node:assert/strict";
const origin=new URL(process.argv[2]||"http://localhost:5173").origin;
if(!["localhost","127.0.0.1"].includes(new URL(origin).hostname))throw new Error("Solo pruebas locales.");
const login=await fetch(origin+"/signin-with-chatgpt?return_to=/",{redirect:"manual"});const cookie=login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
const request=(path,options={})=>fetch(origin+path,{...options,headers:{Cookie:cookie,...options.headers}});
const created=await request("/api/equipment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({customerName:"Adjuntos ficticios",equipmentType:"Laptop",reportedIssue:"Prueba local"})});assert.equal(created.status,201);let order=(await created.json()).equipment;
const privateNote="NOTA-INTERNA-NUNCA-CLIENTE";
await request("/api/equipment/history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({equipmentId:order.id,message:privateNote})});
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=","base64");
const params=new URLSearchParams({equipmentId:String(order.id),operationId:crypto.randomUUID(),filename:"evidencia.png",stage:"ingreso",caption:"Imagen ficticia de un píxel"});
const upload=(query=params,bytes=png,type="image/png")=>request(`/api/equipment/attachments?${query}`,{method:"POST",headers:{"Content-Type":type},body:bytes});
try{
  const race=await Promise.all([upload(),upload()]);assert.deepEqual(race.map(r=>r.status).sort(),[200,201]);const results=await Promise.all(race.map(r=>r.json()));assert.equal(results[0].attachment.id,results[1].attachment.id);const attachment=results[0].attachment;
  const page=await(await request(`/api/equipment/attachments?equipmentId=${order.id}`)).json();assert.equal(page.attachments.length,1);assert.equal(page.attachments[0].objectKey,undefined);
  const replay=await upload();assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  const conflict=new URLSearchParams(params);conflict.set("caption","Otra intención");assert.equal((await upload(conflict)).status,409);
  assert.equal((await upload(params,Buffer.from("<svg/>"))).status,400);
  const downloaded=await request(`/api/equipment/attachments?id=${attachment.id}`);assert.equal(downloaded.status,200);assert.match(downloaded.headers.get("cache-control"),/no-store/);assert.match(downloaded.headers.get("content-disposition"),/attachment/);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png);
  assert.equal((await fetch(origin+`/api/equipment/attachments?id=${attachment.id}`)).status,403);
  const preview=await request(`/api/equipment/attachments?id=${attachment.id}&preview=1`);assert.match(preview.headers.get("content-disposition"),/inline/);
  const backup=await request("/api/backup");assert.equal(backup.status,200);const copy=await backup.json();assert.equal(copy.format,"pacific-tech-records");assert.equal(copy.includesFileBytes,false);assert.ok(copy.tables.attachments.some(a=>a.id===attachment.id));assert.ok(copy.tables.equipment.some(e=>e.id===order.id));assert.ok(copy.tables.equipment_history.some(e=>e.message===privateNote));
  assert.equal((await fetch(origin+"/api/backup")).status,403);
  const customer=await request(`/cliente?orden=${order.id}`);assert.equal(customer.status,404);
  const anonymous=await fetch(origin+`/cliente?orden=${order.id}`);assert.ok(!(await anonymous.text()).includes(order.customerName));
  const history=await(await request(`/api/equipment/history?equipmentId=${order.id}`)).json();assert.equal(history.history.filter(e=>e.kind==="adjunto").length,1);
  console.log("OK D1/R2: carga y descarga exacta, reintentos concurrentes, tipo validado, archivos privados, copia consistente y retirada de la vista del cliente.");
}finally{
  order=(await(await request(`/api/equipment/detail?id=${order.id}`)).json()).equipment;
  await request("/api/equipment",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:order.id,version:order.version,status:"anulado"})});
}
