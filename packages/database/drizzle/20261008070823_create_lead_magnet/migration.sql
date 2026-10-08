CREATE TYPE "leadMagnetKind" AS ENUM('book', 'article', 'template', 'video', 'checklist', 'other');--> statement-breakpoint
CREATE TABLE "LeadMagnet" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"kind" "leadMagnetKind" DEFAULT 'other'::"leadMagnetKind" NOT NULL,
	"url" text,
	"description" text,
	"tagId" bigint,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "LeadMagnet_workspaceId_name_key" ON "LeadMagnet" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "LeadMagnet_tagId_idx" ON "LeadMagnet" ("tagId");--> statement-breakpoint
ALTER TABLE "LeadMagnet" ADD CONSTRAINT "LeadMagnet_tagId_Tag_id_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeadMagnet" ADD CONSTRAINT "LeadMagnet_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;