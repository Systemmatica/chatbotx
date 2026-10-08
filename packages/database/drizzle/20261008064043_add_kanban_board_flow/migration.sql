ALTER TABLE "KanbanBoard" ADD COLUMN "flowId" bigint;--> statement-breakpoint
CREATE INDEX "KanbanBoard_flowId_idx" ON "KanbanBoard" ("flowId");--> statement-breakpoint
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;