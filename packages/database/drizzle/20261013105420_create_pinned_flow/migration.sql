CREATE TABLE "PinnedFlow" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"userId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "PinnedFlow_userId_workspaceId_flowId_key" ON "PinnedFlow" ("userId","workspaceId","flowId");--> statement-breakpoint
CREATE INDEX "PinnedFlow_flowId_idx" ON "PinnedFlow" ("flowId");--> statement-breakpoint
ALTER TABLE "PinnedFlow" ADD CONSTRAINT "PinnedFlow_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PinnedFlow" ADD CONSTRAINT "PinnedFlow_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PinnedFlow" ADD CONSTRAINT "PinnedFlow_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;