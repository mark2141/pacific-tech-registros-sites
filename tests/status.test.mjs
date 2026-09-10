import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEquipmentUpdate,
  InvalidEquipmentStatusError,
  RequiredEquipmentFieldError,
} from "../lib/equipment-update.ts";
import {
  InvalidEquipmentDateError,
  InvalidMoneyValueError,
} from "../lib/equipment-values.ts";

test("pasar a entregado asigna fecha de salida y número de factura", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      assignedTechnician:"Anthony",
      status: "listo",
      exitDate: null,
      invoiceNumber: null,
      partsCostCents: 1_999,
      laborCostCents: 5_000,
    },
    { status: "entregado", exitDate: "2026-08-08" },
  );

  assert.equal(values.status, "entregado");
  assert.equal(values.exitDate, "2026-08-08");
  assert.equal(values.invoiceNumber, "NF-0000042");
  assert.equal(values.invoiceSubtotalCents, 5_000);
  assert.equal(values.invoiceTotalCents, 5_000);
  // Nulo, no cero: una factura emitida sin impuesto se distingue así de una a
  // la que se le aplicó un 0 %, y de las anteriores al cambio, que conservan
  // el ITBMS que sí se cobró.
  assert.equal(values.invoiceTaxCents, null);
  assert.equal(values.invoiceTaxRate, null);
});

test("salir de entregado limpia fecha de salida y factura", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "entregado",
      exitDate: "2026-08-08",
      invoiceNumber: "NF-0000042",
      partsCostCents: 1_999,
      laborCostCents: 5_000,
    },
    { status: "reparacion" },
  );

  assert.equal(values.status, "reparacion");
  assert.equal(values.exitDate, null);
  assert.equal(values.invoiceNumber, null);
  assert.equal(values.invoiceSubtotalCents, null);
  assert.equal(values.invoiceTaxCents, null);
  assert.equal(values.invoiceTotalCents, null);
  assert.equal(values.invoiceTaxRate, null);
});

test("corrige la instantánea si cambian los costos de una orden entregada", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "entregado",
      exitDate: "2026-08-08",
      invoiceNumber: "NF-0000042",
      partsCostCents: 1_999,
      laborCostCents: 5_000,
    },
    { status: "entregado", partsCostCents: 9_999 },
  );

  assert.equal(values.partsCostCents, 9_999);
  assert.equal(values.invoiceSubtotalCents, 14_999);
  assert.equal(values.invoiceTotalCents, 14_999);
  assert.equal(values.invoiceTaxCents, null);
  assert.equal(values.invoiceTaxRate, null);
});

test("corrige la instantánea con un costo parcial aunque se omita el estado", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "entregado",
      exitDate: "2026-08-08",
      invoiceNumber: "NF-0000042",
      partsCostCents: 1_999,
      laborCostCents: 5_000,
    },
    { laborCostCents: 2_500 },
  );

  assert.equal(values.laborCostCents, 2_500);
  assert.equal(values.invoiceSubtotalCents, 4_499);
  assert.equal(values.invoiceTotalCents, 4_499);
});

test("recalcula el impuesto de una factura histórica a partir de su tasa", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "entregado",
      exitDate: "2026-08-08",
      invoiceNumber: "NF-0000042",
      partsCostCents: 10_000,
      laborCostCents: 5_000,
      invoiceTaxCents: 1_050,
      invoiceTaxRate: 0.07,
    },
    { partsCostCents: 10_001 },
  );

  assert.equal(values.invoiceSubtotalCents, 15_001);
  assert.equal(values.invoiceTaxCents, 1_050);
  assert.equal(values.invoiceTaxRate, 0.07);
  assert.equal(values.invoiceTotalCents, 16_051);
});

test("conserva y suma el impuesto histórico cuando solo existe su importe", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "entregado",
      exitDate: "2026-08-08",
      invoiceNumber: "NF-0000042",
      partsCostCents: 10_000,
      laborCostCents: 5_000,
      invoiceTaxCents: 1_050,
      invoiceTaxRate: null,
    },
    { laborCostCents: 6_000 },
  );

  assert.equal(values.invoiceSubtotalCents, 16_000);
  assert.equal(values.invoiceTaxCents, 1_050);
  assert.equal(values.invoiceTaxRate, null);
  assert.equal(values.invoiceTotalCents, 17_050);
});

test("normaliza metadatos fiscales inválidos al corregir una factura", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "entregado",
      exitDate: "2026-08-08",
      invoiceNumber: "NF-0000042",
      partsCostCents: 10_000,
      laborCostCents: 5_000,
      invoiceTaxCents: -1,
      invoiceTaxRate: 7,
    },
    { laborCostCents: 6_000 },
  );

  assert.equal(values.invoiceSubtotalCents, 16_000);
  assert.equal(values.invoiceTaxCents, null);
  assert.equal(values.invoiceTaxRate, null);
  assert.equal(values.invoiceTotalCents, 16_000);
});

test("guardar una orden entregada sin cambiar costos no reescribe la factura", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "entregado",
      exitDate: "2026-08-08",
      invoiceNumber: "NF-0000042",
      partsCostCents: 1_999,
      laborCostCents: 5_000,
    },
    {
      status: "entregado",
      partsCostCents: 1_999,
      laborCostCents: 5_000,
    },
  );

  assert.equal("invoiceSubtotalCents" in values, false);
  assert.equal("invoiceTaxCents" in values, false);
  assert.equal("invoiceTotalCents" in values, false);
  assert.equal("invoiceTaxRate" in values, false);
});

test("rechaza un estado inválido", () => {
  assert.throws(
    () =>
      buildEquipmentUpdate(
        {
          id: 42,
          status: "listo",
          exitDate: null,
          invoiceNumber: null,
          partsCostCents: 0,
          laborCostCents: 0,
        },
        { status: "cancelado" },
      ),
    InvalidEquipmentStatusError,
  );
});

test("rechaza fecha de salida y montos inválidos", () => {
  const current = {
    id: 42,
    status: "listo",
    exitDate: null,
    invoiceNumber: null,
    partsCostCents: 0,
    laborCostCents: 0,
  };

  assert.throws(
    () => buildEquipmentUpdate(current, { status: "entregado", exitDate: "2026-02-30" }),
    InvalidEquipmentDateError,
  );
  assert.throws(
    () => buildEquipmentUpdate(current, { partsCostCents: "error" }),
    InvalidMoneyValueError,
  );
});

test("una descripción de mano de obra vacía se conserva para mostrar la guía", () => {
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "reparacion",
      exitDate: null,
      invoiceNumber: null,
      partsCostCents: 0,
      laborCostCents: 0,
    },
    { laborDescription: "" },
  );

  assert.equal(values.laborDescription, "");
});

const ingresada = {
  id: 7,
  status: "ingreso",
  exitDate: null,
  invoiceNumber: null,
  partsCostCents: 0,
  laborCostCents: 0,
};

test("corrige los datos del cliente y del equipo", () => {
  // Antes solo se escribían al dar de alta: una errata en el nombre o el
  // teléfono se quedaba para siempre.
  const values = buildEquipmentUpdate(ingresada, {
    customerName: "  Ana Rodríguez  ",
    customerPhone: "60001111",
    customerEmail: "ana@example.com",
    equipmentType: "Laptop",
    brand: "Lenovo",
    model: "ThinkPad E14",
    accessories: "Cargador",
    reportedIssue: "No enciende",
    damageNotes: "Rayón en la tapa",
    entryDate: "2026-08-20",
  });

  assert.equal(values.customerName, "Ana Rodríguez");
  assert.equal(values.customerPhone, "60001111");
  assert.equal(values.customerEmail, "ana@example.com");
  assert.equal(values.equipmentType, "Laptop");
  assert.equal(values.brand, "Lenovo");
  assert.equal(values.model, "ThinkPad E14");
  assert.equal(values.accessories, "Cargador");
  assert.equal(values.reportedIssue, "No enciende");
  assert.equal(values.damageNotes, "Rayón en la tapa");
  assert.equal(values.entryDate, "2026-08-20");
});

test("no deja vaciar un campo que la base exige", () => {
  for (const field of ["customerName", "equipmentType", "reportedIssue"]) {
    assert.throws(
      () => buildEquipmentUpdate(ingresada, { [field]: "   " }),
      RequiredEquipmentFieldError,
      `falló con ${field}`,
    );
  }
});

test("solo toca lo que viene en la petición", () => {
  // Un guardado desde la pantalla de costos no debe pisar el nombre del
  // cliente con una cadena vacía.
  const values = buildEquipmentUpdate(ingresada, { diagnosis: "Placa dañada" });

  assert.equal(values.diagnosis, "Placa dañada");
  assert.equal("customerName" in values, false);
  assert.equal("entryDate" in values, false);
  assert.equal("brand" in values, false);
});

test("ignora una fecha de ingreso vacía en lugar de romper la fila", () => {
  // entry_date es NOT NULL: vaciarla desde el formulario no puede tumbar el
  // registro.
  const values = buildEquipmentUpdate(ingresada, { entryDate: "" });
  assert.equal("entryDate" in values, false);
});

test("anular es un estado válido y deja la orden fuera del trabajo en curso", () => {
  const values = buildEquipmentUpdate(ingresada, { status: "anulado" });
  assert.equal(values.status, "anulado");
});

test("anular una orden entregada le quita la factura", () => {
  // Si no, seguiría contando como facturación del mes.
  const values = buildEquipmentUpdate(
    {
      id: 42,
      status: "entregado",
      exitDate: "2026-08-08",
      invoiceNumber: "NF-0000042",
      partsCostCents: 1_999,
      laborCostCents: 5_000,
    },
    { status: "anulado" },
  );

  assert.equal(values.status, "anulado");
  assert.equal(values.exitDate, null);
  assert.equal(values.invoiceNumber, null);
  assert.equal(values.invoiceSubtotalCents, null);
  assert.equal(values.invoiceTotalCents, null);
});
