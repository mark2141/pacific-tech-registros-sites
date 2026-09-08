"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { attachmentStages, MAX_ATTACHMENT_BYTES } from "../lib/attachments";
import { inventoryRequest } from "./inventory-client";
type Attachment = { id: number; filename: string; contentType: string; size: number; stage: string; caption: string; actorEmail: string; createdAt: string };
type Page = { attachments: Attachment[]; nextCursor: number | null };
export function OrderAttachments({equipmentId, disabled, canUpload, onBusy, onDirty, onSaved}:{equipmentId:number;disabled:boolean;canUpload:boolean;onBusy:(value:boolean)=>void;onDirty:(value:boolean)=>void;onSaved:()=>void}) {
  const [page,setPage]=useState<Page|null>(null),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [file,setFile]=useState<File|null>(null),[caption,setCaption]=useState(""),[stage,setStage]=useState("ingreso"),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const fileInput=useRef<HTMLInputElement>(null), operation=useRef<{file:File;caption:string;stage:string;id:string}|null>(null), request=useRef<AbortController|null>(null);
  useEffect(()=>onDirty(Boolean(file||caption)),[file,caption,onDirty]);
  useEffect(()=>{
    const controller=new AbortController();request.current=controller;
    void(async()=>{await Promise.resolve();if(controller.signal.aborted)return;setLoading(true);setError("");
      try{const data=await inventoryRequest<Page>(`/api/equipment/attachments?equipmentId=${equipmentId}`,{signal:controller.signal});if(!controller.signal.aborted)setPage(data);}
      catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"No se pudieron cargar los adjuntos.");}
      finally{if(!controller.signal.aborted)setLoading(false);}
    })();return()=>{controller.abort();request.current?.abort();};
  },[equipmentId,refresh]);
  async function more(){if(!page?.nextCursor||loading)return;const controller=new AbortController();request.current=controller;setLoading(true);
    try{const next=await inventoryRequest<Page>(`/api/equipment/attachments?equipmentId=${equipmentId}&before=${page.nextCursor}`,{signal:controller.signal});if(!controller.signal.aborted)setPage({...next,attachments:[...page.attachments,...next.attachments]});}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"No se pudo cargar la página.");}finally{if(!controller.signal.aborted)setLoading(false);}}
  async function upload(event:React.FormEvent){event.preventDefault();if(!file||busy||disabled||!canUpload)return;setError("");setNotice("");
    if(file.size>MAX_ATTACHMENT_BYTES){setError("El archivo supera 3 MB. Selecciona una versión más pequeña.");return;}
    if(!operation.current||operation.current.file!==file||operation.current.caption!==caption.trim()||operation.current.stage!==stage)operation.current={file,caption:caption.trim(),stage,id:crypto.randomUUID()};
    const params=new URLSearchParams({equipmentId:String(equipmentId),filename:file.name,caption:caption.trim(),stage,operationId:operation.current.id});setBusy(true);onBusy(true);
    try{await inventoryRequest(`/api/equipment/attachments?${params}`,{method:"POST",headers:{"Content-Type":file.type},body:file});setFile(null);setCaption("");operation.current=null;if(fileInput.current)fileInput.current.value="";onDirty(false);onSaved();setRefresh(v=>v+1);setNotice("Archivo guardado en la orden.");}
    catch(e){setError(e instanceof Error?e.message:"No se pudo subir el archivo. Puedes reintentarlo.");}finally{setBusy(false);onBusy(false);}}
  return <details className="order-attachments"><summary>Fotos y adjuntos</summary><div className="attachment-body">
    <p className="field-hint">Evidencia de ingreso, reparación y entrega. JPG, PNG, WebP o PDF, hasta 3 MB por archivo. Solo usuarios del taller pueden consultarlos.</p>
    {canUpload&&<form onSubmit={upload}><fieldset disabled={disabled||busy}><label>Archivo<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={e=>{setFile(e.target.files?.[0]??null);setError("");}}/></label><label>Etapa<select value={stage} onChange={e=>setStage(e.target.value)}>{Object.entries(attachmentStages).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Descripción<input required maxLength={500} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Ej. Estado de la pantalla al recibir el equipo"/></label><button className="primary-button" disabled={!file||!caption.trim()}>{busy?"Subiendo…":"Guardar archivo"}</button></fieldset></form>}
    {error&&<p role="alert" className="field-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="attachment-grid">{page?.attachments.map(item=><article key={item.id} className="attachment-card">{item.contentType.startsWith("image/")&&<Image unoptimized src={`/api/equipment/attachments?id=${item.id}&preview=1`} alt={item.caption} loading="lazy" width="240" height="160"/>}<strong>{attachmentStages[item.stage as keyof typeof attachmentStages]||item.stage}</strong><p>{item.caption}</p><a href={`/api/equipment/attachments?id=${item.id}`}>{item.filename} · Descargar</a><small>{Math.ceil(item.size/1024)} KB · {new Date(item.createdAt).toLocaleString("es-PA",{timeZone:"America/Panama"})}<br/>{item.actorEmail}</small></article>)}</div>
    {loading&&<p role="status">Cargando archivos…</p>}{!loading&&page&&!page.attachments.length&&<p className="field-hint">Esta orden aún no tiene archivos.</p>}
    <button type="button" className="ghost-button" disabled={loading||busy} onClick={()=>setRefresh(v=>v+1)}>Actualizar archivos</button>{page?.nextCursor&&<button type="button" className="secondary-button" disabled={loading||busy} onClick={()=>void more()}>Cargar anteriores</button>}
  </div></details>;
}
