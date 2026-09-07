export const CUSTOMER_PHONE_MIN_LENGTH = 7;
export const CUSTOMER_PHONE_MAX_LENGTH = 15;
export const CUSTOMER_EMAIL_MAX_LENGTH = 254;

const CUSTOMER_PHONE_PATTERN = /^\d{7,15}$/;
const CUSTOMER_EMAIL_PATTERN =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i;

export class InvalidContactValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidContactValueError";
  }
}

export function keepPhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, CUSTOMER_PHONE_MAX_LENGTH);
}

export function isValidCustomerPhone(value: string) {
  return CUSTOMER_PHONE_PATTERN.test(value.trim());
}

export function isValidCustomerEmail(value: string) {
  const normalized = value.trim();
  return (
    normalized.length <= CUSTOMER_EMAIL_MAX_LENGTH &&
    !normalized.includes("..") &&
    CUSTOMER_EMAIL_PATTERN.test(normalized)
  );
}

export function parseOptionalCustomerPhone(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !isValidCustomerPhone(value)) {
    throw new InvalidContactValueError(
      "El teléfono debe contener únicamente números y tener entre 7 y 15 dígitos.",
    );
  }
  return value.trim();
}

export function parseOptionalCustomerEmail(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !isValidCustomerEmail(value)) {
    throw new InvalidContactValueError(
      "El correo debe tener un formato válido, por ejemplo cliente@correo.com.",
    );
  }
  return value.trim();
}
