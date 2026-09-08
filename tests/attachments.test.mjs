import test from "node:test";
import assert from "node:assert/strict";
import { attachmentParams, attachmentType, MAX_ATTACHMENT_BYTES, readAttachment, sameAttachment } from "../lib/attachments.ts";
const valid={equipmentId:"1",operationId:"b2e47d64-f539-4887-a9d1-829d2a6c312f",filename:"pantalla.jpg",stage:"ingreso",caption:"Pantalla al ingreso"};
test("Adjuntos: nombres, categorías e identificadores controlados",()=>{
  assert.equal(attachmentParams(new URLSearchParams(valid)).equipmentId,1);
  for(const patch of [{filename:"../foto.jpg"},{filename:"a\r\nb.jpg"},{filename:""},{stage:"constructor"},{caption:" "},{operationId:"x"},{equipmentId:"-1"}])assert.throws(()=>attachmentParams(new URLSearchParams({...valid,...patch})));
});
test("Adjuntos: valida firma y tipo real, excluye SVG y HTML",()=>{
  assert.equal(attachmentType(new Uint8Array([255,216,255]),"image/jpeg"),"image/jpeg");
  assert.equal(attachmentType(new TextEncoder().encode("%PDF-1.4"),"application/pdf"),"application/pdf");
  assert.throws(()=>attachmentType(new Uint8Array([255,216,255]),"image/png"));
  assert.throws(()=>attachmentType(new TextEncoder().encode("%PDF-1.4"),"application/pdf","foto.jpg"));
  assert.throws(()=>attachmentParams(new URLSearchParams({...valid,filename:"evidencia.html"})));
  for(const data of ["<svg></svg>","<script>alert(1)</script>",""])assert.throws(()=>attachmentType(new TextEncoder().encode(data),"image/jpeg"));
});
test("Adjuntos: límite también para cargas sin Content-Length",async()=>{
  const request=new Request("http://localhost",{method:"POST",body:new Uint8Array(MAX_ATTACHMENT_BYTES+1)});
  await assert.rejects(readAttachment(request),error=>error.status===413);
  await assert.rejects(readAttachment(new Request("http://localhost",{method:"POST",body:""})));
  assert.deepEqual(await readAttachment(new Request("http://localhost",{method:"POST",body:new Uint8Array([1,2])})),new Uint8Array([1,2]));
});
test("Reintentos: no permite sustituir contenido o autor",()=>{
  const a={...valid,equipmentId:1,contentType:"image/jpeg",size:3,sha256:"a",actorUserId:"a",objectKey:"1"};
  assert.equal(sameAttachment(a,{...a,objectKey:"2"}),true);
  for(const patch of [{sha256:"b"},{actorUserId:"b"},{equipmentId:2},{caption:"b"}])assert.equal(sameAttachment(a,{...a,...patch}),false);
});
