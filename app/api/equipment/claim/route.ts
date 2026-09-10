import { getAuthUser } from "../../../auth";
import { accessJson } from "../../../equipment-access";
import { claimEquipment } from "@platform/equipment";
import { getStaff } from "@platform/staff";
import { readEquipmentPayload, InvalidEquipmentPayloadError } from "../../../../lib/equipment-validation";
import { EquipmentConflictError, expectedVersion } from "../../../../lib/equipment-tracking";
import { isTechnicianName } from "../../../../lib/technicians";
export async function POST(request:Request){
  try{
    const user=await getAuthUser();
    if(!user||user.role!=="tecnico")return accessJson({error:"Solo los técnicos pueden tomar una orden."},403);
    const account=await getStaff(user.memberId);
    if(!account?.enabled||!isTechnicianName(account.technicianName))return accessJson({error:"El administrador debe vincular tu cuenta a un nombre de técnico."},403);
    const payload=await readEquipmentPayload(request);
    if(typeof payload.id!=="number"||!Number.isSafeInteger(payload.id)||payload.id<1)throw new InvalidEquipmentPayloadError("Orden inválida.");
    const equipment=await claimEquipment(payload.id,expectedVersion(payload.version),user,account.technicianName);
    return accessJson({equipment});
  }catch(error){
    if(error instanceof EquipmentConflictError)return accessJson({error:"La orden ya fue tomada o cambió. Actualiza las órdenes abiertas."},409);
    if(error instanceof InvalidEquipmentPayloadError)return accessJson({error:error.message},400);
    console.error("No se pudo tomar la orden:",error);return accessJson({error:"No se pudo tomar la orden."},500);
  }
}
