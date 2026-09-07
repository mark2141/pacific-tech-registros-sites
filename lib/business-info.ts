import type { RuntimeEnv } from "./runtime-env.ts";

/**
 * Datos del emisor de la factura.
 *
 * Estaban escritos dentro del componente de la factura, incluidos el RUC y el
 * número de cuenta bancaria. Mientras el repositorio fue privado y local daba
 * igual; en cuanto el código vive en un servicio externo, no.
 *
 * Este módulo es puro: recibe el entorno como argumento en lugar de leerlo. El
 * componente de la factura lo importa desde el cliente, y no debe arrastrar
 * código que toque `process.env` al bundle del navegador. Quien lee el entorno
 * es el componente de servidor, que pasa el resultado como prop.
 */
export type BusinessInfo = {
  legalName: string;
  taxId: string;
  addressLines: string[];
  email: string;
  phone: string;
  website: string;
  paymentMethods: string[];
};

/** Marcador visible: si aparece en una factura, falta configurar el entorno. */
export const UNSET = "— sin configurar —";

function splitList(value: string | undefined) {
  return (value ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function text(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || UNSET;
}

export function resolveBusinessInfo(environment: RuntimeEnv): BusinessInfo {
  return {
    legalName: text(environment.BUSINESS_LEGAL_NAME),
    taxId: text(environment.BUSINESS_TAX_ID),
    addressLines: splitList(environment.BUSINESS_ADDRESS),
    email: text(environment.BUSINESS_EMAIL),
    phone: text(environment.BUSINESS_PHONE),
    website: text(environment.BUSINESS_WEBSITE),
    paymentMethods: splitList(environment.BUSINESS_PAYMENT_METHODS),
  };
}

/** Línea de contacto que firma la factura y el correo al cliente. */
export function contactLine(business: Pick<BusinessInfo, "email" | "phone">) {
  return [business.email, business.phone].filter(Boolean).join(" · ");
}
