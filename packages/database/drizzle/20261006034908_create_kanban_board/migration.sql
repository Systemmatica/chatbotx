CREATE TABLE "KanbanBoard" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"stages" jsonb DEFAULT '[]' NOT NULL,
	"customFieldId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "KanbanBoard_workspaceId_idx" ON "KanbanBoard" ("workspaceId");--> statement-breakpoint
CREATE INDEX "KanbanBoard_customFieldId_idx" ON "KanbanBoard" ("customFieldId");--> statement-breakpoint
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_customFieldId_CustomField_id_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;