CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`email` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`protected` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`staff_id` integer NOT NULL,
	`message` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_staff_audit_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`)
);
--> statement-breakpoint
ALTER TABLE `equipment` ADD `assigned_member_id` integer;