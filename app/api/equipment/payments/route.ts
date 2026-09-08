import { getAuthUser } from "../../../auth";
import { can } from "../../../../lib/permissions";
import { getEquipment } from "@platform/equipment";
import { listPayments, recordPayment } from "@platform/payments";
import { paymentInput, positiveId, PaymentError, balance } from "../../../../lib/payments";
import { readEquipmentPayload, InvalidEquipmentPayloadError } from "../../../../lib/equipment-validation";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof PaymentError) return json({ error: error.message }, error.status);
  if (error instanceof InvalidEquipmentPayloadError) return json({ error: error.message }, 400);
  console.error("Error en pagos:", error);
  return json({ error: "No fue posible completar el pago. Puedes reintentar la misma operación." }, 500);
}
export async function GET(request: Request) {
  try {
    if (!await getAuthUser()) return json({ error: "Acceso denegado." }, 403);
    const params = new URL(request.url).searchParams;
    const id = positiveId(Number(params.get("equipmentId"))), before = params.has("before") ? positiveId(Number(params.get("before"))) : undefined;
    const equipment = await getEquipment(id);
    if (!equipment) return json({ error: "No se encontró la orden." }, 404);
    return json({ ...await listPayments(id, before), balance: balance(equipment), version: equipment.version });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user || !can(user.role, "charge")) return json({ error: "Tu rol no permite registrar pagos." }, 403);
    const input = paymentInput(await readEquipmentPayload(request));
    if (input.reversalOf && !can(user.role, "reverse")) return json({ error: "Solo un administrador puede anular pagos." }, 403);
    return json(await recordPayment(input, user));
  } catch (error) { return failure(error); }
}
