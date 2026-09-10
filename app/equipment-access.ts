import { getEquipment as readEquipment } from "@platform/equipment";
import { getAuthUser } from "./auth";
import { canAccessOrder,operationalData } from "../lib/permissions";
export async function getEquipment(id:number){const user=await getAuthUser();if(!user)return null;const row=await readEquipment(id);return canAccessOrder(user,row)?row:null;}
export async function accessJson(body:unknown,status=200){const user=await getAuthUser();return Response.json(operationalData(body,user?.role??"tecnico"),{status,headers:{"Cache-Control":"private, no-store"}});}
