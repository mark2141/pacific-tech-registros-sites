export const EQUIPMENT_LIST_STATUSES = [
  "ingreso",
  "diagnostico",
  "reparacion",
  "listo",
  "entregado",
  "anulado",
] as const;

export type EquipmentListStatus =
  | "todos"
  | (typeof EQUIPMENT_LIST_STATUSES)[number];

export const EQUIPMENT_SEARCH_MAX_LENGTH = 200;
export const DEFAULT_EQUIPMENT_PAGE_SIZE = 100;
export const MAX_EQUIPMENT_PAGE_SIZE = 500;
export const POSTGRES_INTEGER_MAX = 2_147_483_647;

const STATUS_VALUES = new Set<string>([
  "todos",
  ...EQUIPMENT_LIST_STATUSES,
]);
const CURSOR_PATTERN = /^\d+$/;

export class InvalidEquipmentQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEquipmentQueryError";
  }
}

export type EquipmentCursor = {
  id: number;
};

function onlyValue(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  if (values.length > 1) {
    throw new InvalidEquipmentQueryError(
      `El parámetro ${name} solo puede aparecer una vez.`,
    );
  }
  return values[0] ?? null;
}

function parseUnsignedInteger(
  raw: string | null,
  name: "limit" | "offset",
  fallback: number,
) {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new InvalidEquipmentQueryError(
      name === "limit"
        ? "El parámetro limit debe ser un número entero positivo."
        : "El parámetro offset debe ser un número entero mayor o igual a cero.",
    );
  }

  const parsed = Number(raw);
  if (
    !Number.isSafeInteger(parsed) ||
    (name === "limit" ? parsed < 1 : parsed < 0)
  ) {
    throw new InvalidEquipmentQueryError(
      name === "limit"
        ? "El parámetro limit debe ser un número entero positivo."
        : "El parámetro offset debe ser un número entero mayor o igual a cero.",
    );
  }
  return parsed;
}

export function parseEquipmentCursor(raw: string): EquipmentCursor {
  if (!CURSOR_PATTERN.test(raw)) {
    throw new InvalidEquipmentQueryError("El cursor de paginación no es válido.");
  }

  const id = Number(raw);
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    id > POSTGRES_INTEGER_MAX
  ) {
    throw new InvalidEquipmentQueryError("El cursor de paginación no es válido.");
  }

  return { id };
}

export function serializeEquipmentCursor(cursor: EquipmentCursor) {
  // `id` es inmutable y cabe en la columna INTEGER de Postgres. A diferencia de
  // updated_at, una edición concurrente no mueve la fila a través del cursor.
  const value = String(cursor.id);
  parseEquipmentCursor(value);
  return value;
}

/** Escapa los comodines de LIKE para que la búsqueda sea una subcadena literal. */
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function parseEquipmentListQuery(params: URLSearchParams) {
  const rawSearch = onlyValue(params, "search");
  const search = rawSearch?.trim() ?? "";
  if (search.length > EQUIPMENT_SEARCH_MAX_LENGTH) {
    throw new InvalidEquipmentQueryError(
      `La búsqueda no puede superar ${EQUIPMENT_SEARCH_MAX_LENGTH} caracteres.`,
    );
  }

  const rawStatus = onlyValue(params, "status");
  const status = rawStatus === null || rawStatus === "" ? "todos" : rawStatus;
  if (!STATUS_VALUES.has(status)) {
    throw new InvalidEquipmentQueryError("El filtro de estado no es válido.");
  }

  const requestedLimit = parseUnsignedInteger(
    onlyValue(params, "limit"),
    "limit",
    DEFAULT_EQUIPMENT_PAGE_SIZE,
  );
  const offset = parseUnsignedInteger(
    onlyValue(params, "offset"),
    "offset",
    0,
  );
  const rawCursor = onlyValue(params, "cursor");
  if (rawCursor && offset > 0) {
    throw new InvalidEquipmentQueryError(
      "No se pueden combinar cursor y offset en la misma consulta.",
    );
  }

  return {
    search,
    status: status as EquipmentListStatus,
    limit: Math.min(requestedLimit, MAX_EQUIPMENT_PAGE_SIZE),
    // Se conserva offset para clientes anteriores. La interfaz nueva usa el
    // cursor inmutable `id` para todas las páginas siguientes.
    offset,
    cursor: rawCursor ? parseEquipmentCursor(rawCursor) : null,
  };
}
