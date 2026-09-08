CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`operation_id` text NOT NULL UNIQUE,
	`equipment_id` integer NOT NULL,
	`object_key` text NOT NULL UNIQUE,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`stage` text NOT NULL,
	`caption` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_attachments_equipment_id_equipment_id_fk` FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_equipment` ON `attachments` (`equipment_id`,`id`);