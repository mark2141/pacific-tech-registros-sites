import { getAuthUser } from "../../auth";
import { exportRecords } from "@platform/backup";
const headers={"Cache-Control":"private, no-store"};
export async function GET(){
  try{
    const user=await getAuthUser();if(!user||user.role!=="admin")return Response.json({error:"Solo el administrador puede exportar la copia de registros."},{status:403,headers});
    const tables=await exportRecords();if(!tables)return Response.json({error:"La copia supera el límite de descarga de esta vista (2 MB de registros). Utiliza un respaldo de la base desde el proveedor; no se descargó una copia incompleta."},{status:413,headers});
    const createdAt=new Date().toISOString();
    return Response.json({format:"pacific-tech-records",version:1,createdAt,exportedBy:user.email,includesFileBytes:false,notice:"Incluye metadatos de adjuntos; los archivos se descargan por separado desde cada orden. No incluye configuración de acceso. Restaurar requiere validación técnica sobre una base vacía.",tables},{headers:{...headers,"Content-Disposition":`attachment; filename="pacific-tech-registros-${createdAt.slice(0,10)}.json"`} });
  }catch(error){console.error("Error al exportar copia:",error);return Response.json({error:"No se pudo generar la copia de registros."},{status:500,headers});}
}
