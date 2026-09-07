const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidEquipmentDateError extends Error {
  constructor(fieldLabel: string) {
    super(`La fecha de ${fieldLabel} debe tener el formato YYYY-MM-DD y ser una fecha real.`);
    this.name = "InvalidEquipmentDateError";
  }
}

export class InvalidMoneyValueError extends Error {
  constructor(fieldLabel: string) {
    super(`El monto de ${fieldLabel} no es válido. Ingresa un valor mayor o igual a cero.`);
    this.name = "InvalidMoneyValueError";
  }
}

export function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function parseOptionalIsoDate(value: unknown, fieldLabel: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new InvalidEquipmentDateError(fieldLabel);
  }

  const normalized = value.trim();
  if (!isValidIsoDate(normalized)) {
    throw new InvalidEquipmentDateError(fieldLabel);
  }

  return normalized;
}

export function parseOptionalCents(value: unknown, fieldLabel: string) {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InvalidMoneyValueError(fieldLabel);
  }

  return parsed;
}
