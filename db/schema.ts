import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const equipment = pgTable(
  "equipment",
  {
    // generatedByDefault, no generatedAlways: la importación inicial de datos
    // necesita insertar los id originales para no romper los números de
    // factura `NF-<id>` ya emitidos.
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    orderNumber: text("order_number").notNull().unique(),
    invoiceNumber: text("invoice_number").unique(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull().default(""),
    customerEmail: text("customer_email").notNull().default(""),
    equipmentType: text("equipment_type").notNull(),
    assignedTechnician: text("assigned_technician").notNull().default("Sin asignar"),
    assignedMemberId: integer("assigned_member_id"),
    brand: text("brand").notNull().default(""),
    model: text("model").notNull().default(""),
    serialNumber: text("serial_number").notNull().default(""),
    accessories: text("accessories").notNull().default(""),
    reportedIssue: text("reported_issue").notNull(),
    diagnosis: text("diagnosis").notNull().default(""),
    damageNotes: text("damage_notes").notNull().default(""),
    partsDescription: text("parts_description").notNull().default(""),
    partsCostCents: integer("parts_cost_cents").notNull().default(0),
    laborDescription: text("labor_description").notNull().default("Servicio técnico / mano de obra"),
    laborCostCents: integer("labor_cost_cents").notNull().default(0),
    status: text("status").notNull().default("ingreso"),
    // Las fechas de operación siguen siendo texto `YYYY-MM-DD` derivado de la
    // zona de Panamá. Convertirlas a `date` rompería el agregado de facturación
    // del mes, que filtra con LIKE sobre el prefijo `YYYY-MM`, y obligaría a
    // reescribir lib/panama-date.ts. El tipo textual es deliberado.
    entryDate: text("entry_date").notNull(),
    exitDate: text("exit_date"),
    estimatedExitDate: text("estimated_exit_date"),
    version: integer("version").notNull().default(1),
    paidCents: integer("paid_cents").notNull().default(0),
    invoiceSubtotalCents: integer("invoice_subtotal_cents"),
    invoiceTaxCents: integer("invoice_tax_cents"),
    invoiceTotalCents: integer("invoice_total_cents"),
    invoiceTaxRate: doublePrecision("invoice_tax_rate"),
    warrantyDays: integer("warranty_days").notNull().default(30),
    notes: text("notes").notNull().default(""),
    // Marcas de auditoría como timestamptz reales. En SQLite eran texto, y
    // convivían dos formatos: el default de la base ("2026-08-21 14:00:00") y
    // el que escribía la aplicación ("2026-08-21T14:00:00.000Z"). Como 'T'
    // ordena por encima del espacio, una fila nunca editada quedaba siempre
    // por debajo de una editada en el mismo segundo, y el listado ordena por
    // esta columna. Con un tipo temporal real el orden ya no depende del texto.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("equipment_paid_nonnegative", sql`${table.paidCents} >= 0`),
    // Se conserva para consultas cronológicas y auditoría. El listado operativo
    // pagina por la clave primaria `id`, inmutable frente a ediciones.
    index("idx_equipment_updated_at_id").on(table.updatedAt, table.id),
    // Los agregados del listado agrupan por estado y suman por mes de salida.
    index("idx_equipment_status").on(table.status),
    index("idx_equipment_exit_date").on(table.exitDate),
    index("idx_equipment_status_entry_date").on(table.status, table.entryDate),
    index("idx_equipment_technician_entry").on(table.assignedTechnician, table.entryDate),
    index("idx_equipment_customer_name").on(table.customerName),
  ],
);

export const payments = pgTable("payments", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  operationId: text("operation_id").notNull().unique(),
  equipmentId: integer("equipment_id").notNull().references(() => equipment.id),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull(),
  reference: text("reference").notNull().default(""),
  note: text("note").notNull(),
  reversalOf: integer("reversal_of").unique(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("idx_payments_equipment").on(table.equipmentId, table.id),
  check("payment_sign", sql`(${table.amountCents} > 0 AND ${table.reversalOf} IS NULL) OR (${table.amountCents} < 0 AND ${table.reversalOf} IS NOT NULL)`)]);

// Append-only events. Original notes remain on equipment for legacy records.
export const equipmentHistory = pgTable("equipment_history", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  equipmentId: integer("equipment_id").notNull().references(() => equipment.id),
  kind: text("kind").notNull(),
  message: text("message").notNull().default(""),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("idx_history_equipment_id").on(table.equipmentId, table.id)]);

export const inventoryItems = pgTable("inventory_items", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  supplier: text("supplier").notNull().default(""),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(0),
  version: integer("version").notNull().default(1),
}, table => [check("inventory_stock_bounds", sql`${table.stock} BETWEEN 0 AND 1000000`),
  check("inventory_minimum_bounds", sql`${table.minimumStock} BETWEEN 0 AND 1000000`),
  check("inventory_cost_nonnegative", sql`${table.unitCostCents} >= 0`)]);

export const inventoryMovements = pgTable("inventory_movements", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  operationId: text("operation_id").notNull().unique(),
  itemId: integer("item_id").notNull().references(() => inventoryItems.id),
  equipmentId: integer("equipment_id").references(() => equipment.id),
  sourceMovementId: integer("source_movement_id"),
  kind: text("kind").notNull(),
  quantity: integer("quantity").notNull(),
  unitCostCents: integer("unit_cost_cents").notNull(),
  stockAfter: integer("stock_after").notNull(),
  note: text("note").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("idx_inventory_movements_item").on(table.itemId, table.id),
  index("idx_inventory_movements_equipment").on(table.equipmentId, table.id),
  index("idx_inventory_movements_source").on(table.sourceMovementId),
  check("inventory_movement_nonzero", sql`${table.quantity} != 0`)]);
export const attachments = pgTable("attachments", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  operationId: text("operation_id").notNull().unique(),
  equipmentId: integer("equipment_id").notNull().references(() => equipment.id),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  stage: text("stage").notNull(),
  caption: text("caption").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("idx_attachments_equipment").on(table.equipmentId, table.id)]);
export const staff = pgTable("staff", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  enabled: integer("enabled").notNull().default(1),
  protected: integer("protected").notNull().default(0),
  version: integer("version").notNull().default(1),
});
export const staffAudit = pgTable("staff_audit", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  staffId: integer("staff_id").notNull().references(()=>staff.id),
  message: text("message").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
