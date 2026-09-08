"use client";
import { useState } from "react";
export function BackupDownload(){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function download(){if(busy)return;setBusy(true);setError("");try{
    const response=await fetch("/api/backup",{cache:"no-store"});if(!response.ok){const data=await response.json() as {error?:string};throw new Error(data.error||"No se pudo crear la copia.");}
    const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`pacific-tech-registros-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo descargar la copia.");}finally{setBusy(false);}}
  return <details className="backup-download"><summary>Copias de registros</summary><p>Descarga órdenes, historial, inventario y pagos. Incluye el listado de adjuntos; descarga las fotos y PDF por separado desde cada orden. Conserva las copias en un lugar seguro.</p><button type="button" className="secondary-button" disabled={busy} onClick={()=>void download()}>{busy?"Preparando copia…":"Descargar registros (JSON)"}</button>{error&&<p role="alert" className="field-error">{error}</p>}</details>;
}
