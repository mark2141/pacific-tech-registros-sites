import { getInventoryItem, listInventoryMovements, listOrderParts, moveInventory } from "@platform/inventory";
import { getEquipment } from "../../../equipment-access";
import { accessJson as json } from "../../../equipment-access";
import { getAuthUser } from "../../../auth";
import { can,canSeeFinance } from "../../../../lib/permissions";
import { InventoryError, inventoryParamId, movementInput } from "../../../../lib/inventory";
import { readEquipmentPayload } from "../../../../lib/equipment-validation";
import { inventoryFailure } from "../response";

export async function GET(request: Request) {
  try {
    const viewer=await getAuthUser();if (!viewer) return json({ error: "Acceso denegado." }, 403);
    const params = new URL(request.url).searchParams;
    const itemId = inventoryParamId(params, "itemId"), equipmentId = inventoryParamId(params, "equipmentId"), before = inventoryParamId(params, "before");
    if (Boolean(itemId) === Boolean(equipmentId)) throw new InventoryError("Selecciona un repuesto o una orden.");
    if(itemId&&!canSeeFinance(viewer.role))return json({error:"El historial general de inventario está restringido."},403);
    if (itemId) { if (!await getInventoryItem(itemId)) return json({ error: "No se encontró el repuesto." }, 404); return json(await listInventoryMovements(itemId, before)); }
    if (!await getEquipment(equipmentId!)) return json({ error: "No se encontró la orden." }, 404);
    return json(await listOrderParts(equipmentId!, before));
  } catch (error) { return inventoryFailure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(); if (!user) return json({ error: "Acceso denegado." }, 403);
    const input = movementInput(await readEquipmentPayload(request));
    if(input.equipmentId&&!await getEquipment(input.equipmentId))return json({error:"No se encontró la orden."},404);
    if (!can(user.role, input.equipmentId ? "consume" : "stock")) return json({ error: "Tu rol no permite este movimiento." }, 403);
    return json(await moveInventory(input, user));
  } catch (error) { return inventoryFailure(error); }
}
