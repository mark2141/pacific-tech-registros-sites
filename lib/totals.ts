import { isValidIsoDate } from "./equipment-values.ts";

// Construir un Intl.* cuesta más que formatear con él. La tabla los invoca una
// vez por fila y por render, así que se crean una sola vez por módulo.
const moneyFormatter = new Intl.NumberFormat("es-PA", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("es-PA", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function nonNegativeCents(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Piezas más mano de obra, y nada más.
 *
 * Aquí se sumaba además un 7 % de ITBMS. Ya no: la factura dejó de desglosar
 * impuesto, así que el total es el subtotal. Las columnas `invoice_tax_cents` e
 * `invoice_tax_rate` siguen existiendo en la base porque guardan lo que sí se
 * cobró en las facturas emitidas antes del cambio; para las nuevas quedan en
 * nulo, que es lo que distingue "sin impuesto" de "impuesto cero".
 */
export function calculateTotals(partsCostCents: unknown, laborCostCents: unknown) {
  const subtotalCents =
    nonNegativeCents(partsCostCents) + nonNegativeCents(laborCostCents);

  return { subtotalCents, totalCents: subtotalCents };
}

export function formatMoney(cents: unknown) {
  return moneyFormatter.format(nonNegativeCents(cents) / 100);
}

export function dollarsToCents(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;

  const match = /^(\d+)(?:[.,](\d{0,2}))?$/.exec(normalized);
  if (!match) return null;

  const whole = Number(match[1]);
  const fraction = Number((match[2] || "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToDollarInput(value: unknown) {
  const cents = nonNegativeCents(value);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const datePart = value.slice(0, 10);
  if (!isValidIsoDate(datePart)) return "-";

  return dateFormatter.format(new Date(`${datePart}T12:00:00Z`));
}
