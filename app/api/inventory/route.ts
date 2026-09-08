import { getInventoryItem, listInventory, createInventoryItem, editInventoryItem } from "@platform/inventory";
import { getAuthUser } from "../../auth";
import { inventoryId, inventoryInteger, inventoryMetadata, inventoryParamId, inventoryQuery } from "../../../lib/inventory";
import { readEquipmentPayload } from "../../../lib/equipment-validation";
import { inventoryFailure, inventoryJson as json } from "./response";

export async function GET(request: Request) {
  try {
    if (!await getAuthUser()) return json({ error: "Acceso denegado." }, 403);
    const params = new URL(request.url).searchParams;
    const id = inventoryParamId(params, "itemId");
    if (id) { const item = await getInventoryItem(id); return item ? json({ item }) : json({ error: "No se encontró el repuesto." }, 404); }
    return json(await listInventory(inventoryQuery(params)));
  } catch (error) { return inventoryFailure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(); if (!user) return json({ error: "Acceso denegado." }, 403);
    const payload = await readEquipmentPayload(request);
    return json({ item: await createInventoryItem(inventoryMetadata(payload), inventoryInteger(payload.initialStock ?? 0, "Existencias iniciales"), user) }, 201);
  } catch (error) { return inventoryFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    if (!await getAuthUser()) return json({ error: "Acceso denegado." }, 403);
    const payload = await readEquipmentPayload(request);
    return json({ item: await editInventoryItem(inventoryId(payload.id), inventoryId(payload.version), inventoryMetadata(payload)) });
  } catch (error) { return inventoryFailure(error); }
}
