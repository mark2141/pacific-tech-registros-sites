CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`sku` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`minimum_stock` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inventory_stock_bounds" CHECK("stock" BETWEEN 0 AND 1000000),
	CONSTRAINT "inventory_minimum_bounds" CHECK("minimum_stock" BETWEEN 0 AND 1000000),
	CONSTRAINT "inventory_cost_nonnegative" CHECK("unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`operation_id` text NOT NULL UNIQUE,
	`item_id` integer NOT NULL,
	`equipment_id` integer,
	`source_movement_id` integer,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost_cents` integer NOT NULL,
	`stock_after` integer NOT NULL,
	`note` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_inventory_movements_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT `fk_inventory_movements_equipment_id_equipment_id_fk` FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`),
	CONSTRAINT "inventory_movement_nonzero" CHECK("quantity" != 0)
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_movements_item` ON `inventory_movements` (`item_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_movements_equipment` ON `inventory_movements` (`equipment_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_movements_source` ON `inventory_movements` (`source_movement_id`);