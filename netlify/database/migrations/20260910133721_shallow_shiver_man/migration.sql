ALTER TABLE "equipment" ADD COLUMN "invoice_kind" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "invoice_technician" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "technician_name" text;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_technician_name_key" UNIQUE("technician_name");--> statement-breakpoint
CREATE INDEX "idx_equipment_member_status" ON "equipment" ("assigned_member_id","status");