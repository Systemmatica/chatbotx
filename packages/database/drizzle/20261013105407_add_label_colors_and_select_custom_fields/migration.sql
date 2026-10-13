CREATE TYPE "labelColor" AS ENUM('default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red');--> statement-breakpoint
ALTER TYPE "customFieldType" ADD VALUE 'select';--> statement-breakpoint
ALTER TYPE "customFieldType" ADD VALUE 'multiSelect';--> statement-breakpoint
ALTER TABLE "CustomField" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "Tag" ADD COLUMN "color" "labelColor";