import Link from "next/link";
import { getAuthUser } from "../auth";
import { getEquipment } from "@platform/equipment";
import { balance } from "../../lib/payments";
import { formatDate, formatMoney } from "../../lib/totals";
export const dynamic="force-dynamic";
const statuses:Record<string,string>={ingreso:"Equipo recibido",diagnostico:"En diagnóstico",reparacion:"En reparación",listo:"Listo para retirar",entregado:"Equipo entregado",anulado:"Orden anulada"};
export default async function CustomerPreview({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  if(!await getAuthUser())return <main className="customer-preview"><h1>Acceso privado</h1><p>Inicia sesión en el registro para revisar esta vista.</p><Link href="/">Volver al registro</Link></main>;
  const params=await searchParams,id=typeof params.orden==="string"&&/^\d+$/.test(params.orden)?Number(params.orden):0;
  const order=id>0&&id<=2147483647?await getEquipment(id):null;
  if(!order)return <main className="customer-preview"><h1>Orden no encontrada</h1><Link href="/">Volver al registro</Link></main>;
  const totals=balance(order);
  return <main className="customer-preview"><aside className="preview-banner">Vista de revisión privada · Aún no es un enlace de acceso para clientes</aside>
    <header><p className="eyebrow">PACIFIC TECH · SEGUIMIENTO</p><h1>Tu reparación</h1><p>Orden {order.orderNumber} · {order.customerName}</p></header>
    <section className="customer-status"><p className="eyebrow">ESTADO ACTUAL</p><h2>{statuses[order.status]||"En seguimiento"}</h2>{order.status==="listo"&&<p>Tu equipo está listo. Coordina el retiro con el taller.</p>}<p>{order.equipmentType} {[order.brand,order.model].filter(Boolean).join(" ")}</p>
      <dl><dt>Recibido</dt><dd>{formatDate(order.entryDate)}</dd>{order.exitDate?<><dt>Entregado</dt><dd>{formatDate(order.exitDate)}</dd></>:order.estimatedExitDate&&order.status!=="anulado"?<><dt>Entrega estimada</dt><dd>{formatDate(order.estimatedExitDate)} · Fecha sujeta al diagnóstico y disponibilidad de repuestos.</dd></>:null}</dl>
    </section>
    <section><h2>{order.status==="entregado"?"Importe del servicio":"Importe estimado"}</h2><div className="payment-summary"><span>Total<strong>{formatMoney(totals.totalCents)}</strong></span><span>Abonado<strong>{formatMoney(totals.paidCents)}</strong></span><span>Saldo<strong>{formatMoney(totals.dueCents)}</strong></span></div><p>{totals.label}</p>{order.status!=="entregado"&&order.status!=="anulado"&&<p>El importe puede cambiar según el trabajo acordado con el taller.</p>}</section>
    <footer><Link className="secondary-button" href="/">Volver al registro</Link></footer>
  </main>;
}
