import { getInventoryItem, listInventoryMovements, listOrderParts, moveInventory } from "@platform/inventory";
import { getEquipment } from "@platform/equipment";
import { getAuthUser } from "../../../auth";
import { can } from "../../../../lib/permissions";
import { InventoryError, inventoryParamId, movementInput } from "../../../../lib/inventory";
import { readEquipmentPayload } from "../../../../lib/equipment-validation";
import { inventoryFailure, inventoryJson as json } from "../response";

export async function GET(request: Request) {
  try {
    if (!await getAuthUser()) return json({ error: "Acceso denegado." }, 403);
    const params = new URL(request.url).searchParams;
    const itemId = inventoryParamId(params, "itemId"), equipmentId = inventoryParamId(params, "equipmentId"), before = inventoryParamId(params, "before");
    if (Boolean(itemId) === Boolean(equipmentId)) throw new InventoryError("Selecciona un repuesto o una orden.");
    if (itemId) { if (!await getInventoryItem(itemId)) return json({ error: "No se encontró el repuesto." }, 404); return json(await listInventoryMovements(itemId, before)); }
    if (!await getEquipment(equipmentId!)) return json({ error: "No se encontró la orden." }, 404);
    return json(await listOrderParts(equipmentId!, before));
  } catch (error) { return inventoryFailure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(); if (!user) return json({ error: "Acceso denegado." }, 403);
    const input = movementInput(await readEquipmentPayload(request));
    if (!can(user.role, input.equipmentId ? "consume" : "stock")) return json({ error: "Tu rol no permite este movimiento." }, 403);
    return json(await moveInventory(input, user));
  } catch (error) { return inventoryFailure(error); }
}
