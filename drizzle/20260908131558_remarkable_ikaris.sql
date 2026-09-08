CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`operation_id` text NOT NULL UNIQUE,
	`equipment_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`note` text NOT NULL,
	`reversal_of` integer UNIQUE,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_payments_equipment_id_equipment_id_fk` FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`),
	CONSTRAINT "payment_sign" CHECK(("amount_cents" > 0 AND "reversal_of" IS NULL) OR ("amount_cents" < 0 AND "reversal_of" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE `equipment` ADD `paid_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_payments_equipment` ON `payments` (`equipment_id`,`id`);