import { getAuthUser } from "../../auth";
import { listStaff,listStaffAudit,listTechnicians,saveStaff } from "@platform/staff";
import { isUniqueConstraintError } from "../../../lib/database-error";
import { staffInput,StaffError } from "../../../lib/staff";
import { readEquipmentPayload,InvalidEquipmentPayloadError } from "../../../lib/equipment-validation";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
function fail(error:unknown){if(isUniqueConstraintError(error))return json({error:"Ese correo o nombre de técnico ya está vinculado a otra cuenta."},409);if(error instanceof StaffError)return json({error:error.message},error.status);if(error instanceof InvalidEquipmentPayloadError)return json({error:error.message},400);console.error("Error de usuarios:",error);return json({error:"No se pudo completar la operación."},500);}
export async function GET(request:Request){try{const user=await getAuthUser();if(!user)return json({error:"Acceso denegado."},403);const params=new URL(request.url).searchParams;
  if(params.get("technicians")==="1"&&user.role==="admin")return json({technicians:await listTechnicians()});
  if(user.role!=="admin")return json({error:"Solo el administrador puede gestionar usuarios."},403);
  const before=params.has("before")?Number(params.get("before")):undefined;if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))throw new StaffError("Cursor inválido.");
  return json({...await listStaff(before),audit:await listStaffAudit()});}catch(error){return fail(error);}}
export async function POST(request:Request){try{const user=await getAuthUser();if(!user||user.role!=="admin")return json({error:"Acceso denegado."},403);return json({user:await saveStaff(staffInput(await readEquipmentPayload(request)),user)},201);}catch(error){return fail(error);}}
export async function PATCH(request:Request){try{const user=await getAuthUser();if(!user||user.role!=="admin")return json({error:"Acceso denegado."},403);const payload=await readEquipmentPayload(request);const id=Number(payload.id),version=Number(payload.version);if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(version)||version<1)throw new StaffError("Cuenta inválida.");return json({user:await saveStaff(staffInput(payload),user,id,version)});}catch(error){return fail(error);}}
