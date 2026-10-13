CREATE TABLE "ContactView" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"createdById" bigint,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ContactView_workspaceId_position_idx" ON "ContactView" ("workspaceId","position");--> statement-breakpoint
ALTER TABLE "ContactView" ADD CONSTRAINT "ContactView_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactView" ADD CONSTRAINT "ContactView_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;