import { getEquipment,accessJson } from "../../../equipment-access";
import { getAuthUser } from "../../../auth";
import { InvalidEquipmentQueryError, parseEquipmentCursor } from "../../../../lib/equipment-query";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    if (!await getAuthUser()) return Response.json({ error: "Acceso denegado." }, { status: 403, headers });
    const params = new URL(request.url).searchParams;
    if (params.getAll("id").length !== 1) throw new InvalidEquipmentQueryError("Registro inválido.");
    const { id } = parseEquipmentCursor(params.get("id")!);
    const equipment = await getEquipment(id);
    return accessJson(equipment ? { equipment } : { error: "No se encontró el equipo." }, equipment ? 200 : 404);
  } catch (error) {
    if (error instanceof InvalidEquipmentQueryError) return Response.json({ error: error.message }, { status: 400, headers });
    console.error("Error al consultar la orden:", error);
    return Response.json({ error: "No se pudo cargar la orden." }, { status: 500, headers });
  }
}
