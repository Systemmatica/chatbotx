ALTER TABLE "Workspace" ADD COLUMN "stuckContactNotifyHours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "WorkspaceMember" ADD COLUMN "telegramChatId" text;