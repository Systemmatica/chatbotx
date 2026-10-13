CREATE TYPE "contactActivityActorType" AS ENUM('user', 'bot', 'api');--> statement-breakpoint
CREATE TYPE "contactActivityType" AS ENUM('tagAdded', 'tagRemoved', 'customFieldChanged', 'flowStarted', 'assignmentChanged', 'conversationClosed');--> statement-breakpoint
CREATE TABLE "ContactActivity" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"type" "contactActivityType" NOT NULL,
	"actorType" "contactActivityActorType" DEFAULT 'bot'::"contactActivityActorType" NOT NULL,
	"actorUserId" bigint,
	"payload" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ContactActivity_contactId_createdAt_idx" ON "ContactActivity" ("contactId","createdAt" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX "ContactActivity_workspaceId_idx" ON "ContactActivity" ("workspaceId");--> statement-breakpoint
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_actorUserId_User_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;