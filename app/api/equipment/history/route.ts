import { getEquipment, listEquipmentHistory, addEquipmentNote, getLastEquipmentContact } from "@platform/equipment";
import { contactEventMessage } from "../../../../lib/customer-message";
import { getAuthUser } from "../../../auth";
import { InvalidEquipmentQueryError, parseEquipmentCursor } from "../../../../lib/equipment-query";
import { InvalidEquipmentPayloadError, readEquipmentPayload } from "../../../../lib/equipment-validation";
import { parseHistoryNote } from "../../../../lib/equipment-tracking";

const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
function failure(error: unknown) {
  if (error instanceof InvalidEquipmentQueryError || error instanceof InvalidEquipmentPayloadError) return json({ error: error.message }, 400);
  console.error("Error en el historial:", error);
  return json({ error: "No se pudo completar la operación del historial." }, 500);
}

export async function GET(request: Request) {
  try {
    if (!await getAuthUser()) return json({ error: "Acceso denegado." }, 403);
    const params = new URL(request.url).searchParams;
    if (params.getAll("equipmentId").length !== 1 || params.getAll("before").length > 1) throw new InvalidEquipmentQueryError("Consulta de historial inválida.");
    const { id } = parseEquipmentCursor(params.get("equipmentId")!);
    const before = params.has("before") ? parseEquipmentCursor(params.get("before")!).id : undefined;
    if (!await getEquipment(id)) return json({ error: "No se encontró el equipo." }, 404);
    const [page, lastContact] = await Promise.all([listEquipmentHistory(id, before), getLastEquipmentContact(id)]);
    return json({ ...page, lastContact });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return json({ error: "Acceso denegado." }, 403);
    const payload = await readEquipmentPayload(request);
    if (typeof payload.equipmentId !== "number" && typeof payload.equipmentId !== "string") throw new InvalidEquipmentQueryError("Registro inválido.");
    const { id } = parseEquipmentCursor(String(payload.equipmentId));
    if (payload.kind !== undefined && payload.kind !== "nota" && payload.kind !== "contacto") throw new InvalidEquipmentPayloadError("Tipo de registro inválido.");
    const kind = payload.kind === "contacto" ? "contacto" : "nota";
    const note = kind === "contacto" ? contactEventMessage(payload) : parseHistoryNote(payload.message);
    const event = await addEquipmentNote(id, note, user, kind);
    return event ? json({ event }, 201) : json({ error: "No se encontró el equipo." }, 404);
  } catch (error) { return failure(error); }
}
