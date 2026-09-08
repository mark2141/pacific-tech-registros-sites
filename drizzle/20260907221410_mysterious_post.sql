CREATE TABLE `equipment_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`equipment_id` integer NOT NULL,
	`kind` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`from_status` text,
	`to_status` text,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_equipment_history_equipment_id_equipment_id_fk` FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`)
);
--> statement-breakpoint
ALTER TABLE `equipment` ADD `estimated_exit_date` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_equipment_technician_entry` ON `equipment` (`assigned_technician`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_history_equipment_id` ON `equipment_history` (`equipment_id`,`id`);