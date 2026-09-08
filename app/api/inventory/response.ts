import { InventoryError } from "../../../lib/inventory";
import { InvalidEquipmentPayloadError } from "../../../lib/equipment-validation";
import { isUniqueConstraintError } from "../../../lib/database-error";
export const inventoryJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export function inventoryFailure(error: unknown) {
  if (error instanceof InventoryError) return inventoryJson({ error: error.message }, error.status);
  if (error instanceof InvalidEquipmentPayloadError) return inventoryJson({ error: error.message }, 400);
  if (isUniqueConstraintError(error)) return inventoryJson({ error: "Ese código u operación ya existe. Revisa el inventario antes de repetirla." }, 409);
  console.error("Error en inventario:", error);
  return inventoryJson({ error: "No se pudo completar la operación de inventario." }, 500);
}
