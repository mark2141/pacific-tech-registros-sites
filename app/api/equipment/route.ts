import { EquipmentConflictError, parseWarrantyDays, parseEstimatedExitDate } from "../../../lib/equipment-tracking";
import { readEquipmentPayload, InvalidEquipmentPayloadError } from "../../../lib/equipment-validation";
import { listEquipment, createEquipment, updateEquipment } from "@platform/equipment";
import { isUniqueConstraintError } from "../../../lib/database-error";
import {
  InvalidEquipmentStatusError,
  RequiredEquipmentFieldError,
} from "../../../lib/equipment-update";
import {
  InvalidEquipmentDateError,
  InvalidMoneyValueError,
  parseOptionalIsoDate,
} from "../../../lib/equipment-values";
import { orderNumberPrefix } from "../../../lib/order-number";
import { todayInPanama } from "../../../lib/panama-date";
import { getAuthUser } from "../../auth";
import { can, canEditPayload } from "../../../lib/permissions";
import { accessJson } from "../../equipment-access";
import { getStaff,listTechnicians } from "@platform/staff";
import { PaymentError } from "../../../lib/payments";
import {
  InvalidContactValueError,
  parseOptionalCustomerEmail,
  parseOptionalCustomerPhone,
} from "../../../lib/contact-values";
import {
  InvalidEquipmentQueryError,
  parseEquipmentListQuery,
} from "../../../lib/equipment-query";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// Las respuestas llevan nombres, teléfonos, correos y seriales de clientes:
// ningún intermediario debe guardarlas.


function json(body: unknown, status = 200) {
  return accessJson(body,status);
}

// El detalle del error solo va al log del Worker: los mensajes de D1 y Drizzle
// exponen SQL y nombres de tabla que no deben salir por HTTP.
function routeError(error: unknown) {
  if (error instanceof PaymentError) return json({ error: error.message }, error.status);
  console.error("Error en /api/equipment:", error);

  if (isUniqueConstraintError(error)) {
    return json({ error: "Ya existe una orden o factura con ese número." }, 409);
  }

  return json(
    { error: "No fue posible completar la operación. Inténtalo nuevamente." },
    500,
  );
}

function unauthorized() {
  return json({ error: "Acceso denegado: se requiere una sesión válida." }, 403);
}

function validationResponse(error: unknown) {
  if (
    error instanceof InvalidEquipmentPayloadError ||
    error instanceof InvalidEquipmentDateError ||
    error instanceof InvalidMoneyValueError ||
    error instanceof InvalidContactValueError ||
    error instanceof RequiredEquipmentFieldError
  ) {
    return json({ error: error.message }, 400);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    const available=new URL(request.url).searchParams.get("view")==="available";
    const account=available&&user.role==="tecnico"?await getStaff(user.memberId):null;
    if(available&&user.role==="tecnico"&&!account?.technicianName)return json({error:"El administrador debe vincular tu cuenta a un nombre de técnico."},403);
    const query = parseEquipmentListQuery(
      new URL(request.url).searchParams,
    );
    const result=await listEquipment({...query,scopeMemberId:!available&&user.role==="tecnico"?user.memberId:undefined,availableFor:available?(account?.technicianName??"Sin asignar"):undefined});
    if(available)return json({...result,summary:undefined,equipment:result.equipment.map(({id,version,orderNumber,equipmentType,brand,model,reportedIssue,entryDate,assignedTechnician})=>({id,version,orderNumber,equipmentType,brand,model,reportedIssue,entryDate,assignedTechnician}))});
    return json(result);
  } catch (error) {
    if (error instanceof InvalidEquipmentQueryError) {
      return json({ error: error.message }, 400);
    }
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user || !can(user.role, "receive")) return unauthorized();
    const payload = await readEquipmentPayload(request);
    const customerName = clean(payload.customerName);
    const equipmentType = clean(payload.equipmentType);
    const reportedIssue = clean(payload.reportedIssue);
    const customerPhone = parseOptionalCustomerPhone(payload.customerPhone);
    const customerEmail = parseOptionalCustomerEmail(payload.customerEmail);
    const today = todayInPanama();
    const entryDate = parseOptionalIsoDate(payload.entryDate, "ingreso") || today;

    if (!customerName || !equipmentType || !reportedIssue) {
      return json({ error: "Cliente, tipo de equipo y falla reportada son obligatorios." }, 400);
    }

    const orderPrefix = orderNumberPrefix(today);
    const assignment=await assignmentValues(payload);
    const insertValues = {
      invoiceKind:"technician",
      customerName,
      customerPhone,
      customerEmail,
      equipmentType,
      assignedTechnician: clean(payload.assignedTechnician) || "Sin asignar",
      brand: clean(payload.brand),
      model: clean(payload.model),
      accessories: clean(payload.accessories),
      serialNumber: clean(payload.serialNumber),
      estimatedExitDate: parseEstimatedExitDate(payload.estimatedExitDate, entryDate),
      warrantyDays: payload.warrantyDays === undefined ? 30 : parseWarrantyDays(payload.warrantyDays),
      reportedIssue,
      damageNotes: clean(payload.damageNotes),
      laborDescription: "",
      entryDate,
      notes: clean(payload.notes),
      ...assignment,
    };

    const row = await createEquipment(insertValues, orderPrefix, user);

    return json({ equipment: row }, 201);
  } catch (error) {
    const validation = validationResponse(error);
    if (validation) return validation;
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    const payload = await readEquipmentPayload(request);
    if (!canEditPayload(user.role, payload)) return unauthorized();
    const id = Number(payload.id);
    if ((typeof payload.id !== "number" && typeof payload.id !== "string") || !/^[0-9]+$/.test(String(payload.id)) || !Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
      return json({ error: "Registro inválido." }, 400);
    }

    if ("notes" in payload) throw new InvalidEquipmentPayloadError("Las notas se añaden desde el historial; las anteriores se conservan.");
    const assignment=await assignmentValues(payload);
    const row = await updateEquipment(id, {...payload,...assignment}, user);
    if (!row) {
      return json({ error: "No se encontró el equipo." }, 404);
    }
    return json({ equipment: row });
  } catch (error) {
    if (error instanceof EquipmentConflictError) return json({ error: error.message, code: "ORDER_CONFLICT" }, 409);
    if (error instanceof InvalidEquipmentStatusError) {
      return json({ error: "Estado inválido." }, 400);
    }
    const validation = validationResponse(error);
    if (validation) return validation;
    return routeError(error);
  }
}
async function assignmentValues(payload:Record<string,unknown>){
  if(!("assignedMemberId" in payload)&&!("assignedTechnician" in payload))return {};
  if(payload.assignedMemberId==null){
    const name=clean(payload.assignedTechnician)||"Sin asignar";
    if(name==="Sin asignar")return{assignedMemberId:null,assignedTechnician:name};
    const technician=(await listTechnicians()).find(row=>row.name===name);
    if(!technician)throw new InvalidEquipmentPayloadError("Selecciona un nombre del desplegable de técnicos.");
    return{assignedMemberId:technician.id,assignedTechnician:technician.name};
  }
  if(typeof payload.assignedMemberId!=="number"||!Number.isSafeInteger(payload.assignedMemberId)||payload.assignedMemberId<1)throw new InvalidEquipmentPayloadError("Cuenta de técnico inválida.");
  const member=await getStaff(payload.assignedMemberId);
  if(!member||!member.enabled||!["tecnico","admin"].includes(member.role)||!member.technicianName)throw new InvalidEquipmentPayloadError("Selecciona un técnico activo.");
  return{assignedMemberId:member.id,assignedTechnician:member.technicianName};
}
