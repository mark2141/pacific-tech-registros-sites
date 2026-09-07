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
const NO_STORE = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

// El detalle del error solo va al log del Worker: los mensajes de D1 y Drizzle
// exponen SQL y nombres de tabla que no deben salir por HTTP.
function routeError(error: unknown) {
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
    const { search, status, limit, offset, cursor } = parseEquipmentListQuery(
      new URL(request.url).searchParams,
    );
    return json(await listEquipment({ search, status, limit, offset, cursor }));
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
    if (!user) return unauthorized();
    const payload = (await request.json()) as Record<string, unknown>;
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
    const insertValues = {
      customerName,
      customerPhone,
      customerEmail,
      equipmentType,
      assignedTechnician: clean(payload.assignedTechnician) || "Sin asignar",
      brand: clean(payload.brand),
      model: clean(payload.model),
      accessories: clean(payload.accessories),
      reportedIssue,
      damageNotes: clean(payload.damageNotes),
      laborDescription: "",
      entryDate,
      notes: clean(payload.notes),
    };

    const row = await createEquipment(insertValues, orderPrefix);

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
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id < 1) {
      return json({ error: "Registro inválido." }, 400);
    }

    const row = await updateEquipment(id, payload);
    if (!row) {
      return json({ error: "No se encontró el equipo." }, 404);
    }
    return json({ equipment: row });
  } catch (error) {
    if (error instanceof InvalidEquipmentStatusError) {
      return json({ error: "Estado inválido." }, 400);
    }
    const validation = validationResponse(error);
    if (validation) return validation;
    return routeError(error);
  }
}
