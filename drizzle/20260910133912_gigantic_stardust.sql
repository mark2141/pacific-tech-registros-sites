ALTER TABLE `equipment` ADD `invoice_kind` text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ADD `invoice_technician` text;--> statement-breakpoint
ALTER TABLE `staff` ADD `technician_name` text;--> statement-breakpoint
CREATE INDEX `idx_equipment_member_status` ON `equipment` (`assigned_member_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_staff_technician_name` ON `staff` (`technician_name`);