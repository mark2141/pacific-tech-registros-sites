import assert from "node:assert/strict";
import test from "node:test";
import { buildInvoiceEmailHref } from "../lib/invoice-email.ts";

const business = {
  legalName: "Taller de Pruebas S.A.",
  taxId: "000000-0-000000 DV00",
  addressLines: ["Calle de Pruebas, Local 1"],
  email: "pruebas@example.com",
  phone: "6000-0000",
  website: "example.com",
  paymentMethods: ["Efectivo"],
};

const record = {
  id: 42,
  orderNumber: "PT-2608-0042",
  invoiceNumber: "NF-0000042",
  customerName: "Ana Rodríguez",
  customerEmail: "ana@example.com",
  equipmentType: "Laptop",
  brand: "Lenovo",
  model: "E14",
  diagnosis: "Se reemplazó el teclado.",
  reportedIssue: "El teclado no funciona.",
  partsDescription: "Teclado",
  partsCostCents: 2500,
  laborDescription: "Instalación",
  laborCostCents: 1500,
  invoiceTotalCents: 4280,
  warrantyDays: 30,
};

test("prepara la factura para el correo guardado del cliente", () => {
  const href = buildInvoiceEmailHref(record, business);
  assert.ok(href?.startsWith("mailto:ana%40example.com?"));
  const query = new URL(href).searchParams;
  assert.match(query.get("subject") || "", /NF-0000042/);
  assert.match(query.get("body") || "", /Total:.*42[,.]80/s);
  // Ni serial ni desglose de impuesto: los dos se retiraron de la factura.
  const body = query.get("body") || "";
  assert.doesNotMatch(body, /IMEI|Serie/);
  assert.doesNotMatch(body, /ITBMS|Subtotal/);
  assert.match(query.get("body") || "", /Teclado/);
});

test("no prepara el envío si la orden no tiene un correo válido", () => {
  assert.equal(buildInvoiceEmailHref({ ...record, customerEmail: "" }, business), null);
  assert.equal(
    buildInvoiceEmailHref({ ...record, customerEmail: "correo-invalido" }, business),
    null,
  );
});

test("firma el correo con el emisor configurado, no con datos escritos en el código", () => {
  const href = buildInvoiceEmailHref(record, business);
  const body = new URL(href).searchParams.get("body") || "";
  assert.match(body, /Taller de Pruebas S\.A\./);
  assert.match(body, /pruebas@example\.com · 6000-0000/);
  assert.match(new URL(href).searchParams.get("subject") || "", /Taller de Pruebas/);
});
