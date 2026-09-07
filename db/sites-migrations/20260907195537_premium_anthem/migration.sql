CREATE TABLE `equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`order_number` text NOT NULL UNIQUE,
	`invoice_number` text UNIQUE,
	`customer_name` text NOT NULL,
	`customer_phone` text DEFAULT '' NOT NULL,
	`customer_email` text DEFAULT '' NOT NULL,
	`equipment_type` text NOT NULL,
	`assigned_technician` text DEFAULT 'Sin asignar' NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`serial_number` text DEFAULT '' NOT NULL,
	`accessories` text DEFAULT '' NOT NULL,
	`reported_issue` text NOT NULL,
	`diagnosis` text DEFAULT '' NOT NULL,
	`damage_notes` text DEFAULT '' NOT NULL,
	`parts_description` text DEFAULT '' NOT NULL,
	`parts_cost_cents` integer DEFAULT 0 NOT NULL,
	`labor_description` text DEFAULT 'Servicio técnico / mano de obra' NOT NULL,
	`labor_cost_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ingreso' NOT NULL,
	`entry_date` text NOT NULL,
	`exit_date` text,
	`invoice_subtotal_cents` integer,
	`invoice_tax_cents` integer,
	`invoice_total_cents` integer,
	`invoice_tax_rate` real,
	`warranty_days` integer DEFAULT 30 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_equipment_updated_at_id` ON `equipment` (`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_equipment_status` ON `equipment` (`status`);--> statement-breakpoint
CREATE INDEX `idx_equipment_exit_date` ON `equipment` (`exit_date`);--> statement-breakpoint
CREATE INDEX `idx_equipment_status_entry_date` ON `equipment` (`status`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_equipment_customer_name` ON `equipment` (`customer_name`);