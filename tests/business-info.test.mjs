import assert from "node:assert/strict";
import test from "node:test";
import {
  UNSET,
  contactLine,
  resolveBusinessInfo,
} from "../lib/business-info.ts";

test("lee el emisor del entorno y parte las listas por |", () => {
  const business = resolveBusinessInfo({
    BUSINESS_LEGAL_NAME: "Taller S.A.",
    BUSINESS_TAX_ID: "123456-7-890123 DV45",
    BUSINESS_ADDRESS: "Calle 1, Local 2 | Ciudad · País",
    BUSINESS_EMAIL: "ventas@example.com",
    BUSINESS_PHONE: "6000-0000",
    BUSINESS_WEBSITE: "example.com",
    BUSINESS_PAYMENT_METHODS: "Efectivo | Tarjeta | Transferencia",
  });

  assert.equal(business.legalName, "Taller S.A.");
  assert.equal(business.taxId, "123456-7-890123 DV45");
  assert.deepEqual(business.addressLines, ["Calle 1, Local 2", "Ciudad · País"]);
  assert.deepEqual(business.paymentMethods, ["Efectivo", "Tarjeta", "Transferencia"]);
});

test("marca lo que falta en vez de dejarlo en blanco", () => {
  // Un hueco vacío en una factura pasa desapercibido; el marcador no. Es la
  // diferencia entre entregarle a un cliente una factura sin RUC y darse cuenta.
  const business = resolveBusinessInfo({});

  assert.equal(business.legalName, UNSET);
  assert.equal(business.taxId, UNSET);
  assert.equal(business.email, UNSET);
  assert.deepEqual(business.addressLines, []);
  assert.deepEqual(business.paymentMethods, []);
});

test("ignora separadores sueltos y espacios de más", () => {
  const business = resolveBusinessInfo({
    BUSINESS_ADDRESS: " | Calle 1 |  | Ciudad | ",
    BUSINESS_LEGAL_NAME: "   ",
  });

  assert.deepEqual(business.addressLines, ["Calle 1", "Ciudad"]);
  assert.equal(business.legalName, UNSET);
});

test("la línea de contacto une correo y teléfono", () => {
  assert.equal(
    contactLine({ email: "ventas@example.com", phone: "6000-0000" }),
    "ventas@example.com · 6000-0000",
  );
  assert.equal(contactLine({ email: "ventas@example.com", phone: "" }), "ventas@example.com");
  assert.equal(contactLine({ email: "", phone: "" }), "");
});
