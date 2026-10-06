ALTER TABLE "ContactInbox" ADD COLUMN "currentFlowId" bigint;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "currentNodeId" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "currentNodeAt" timestamp(6) with time zone;