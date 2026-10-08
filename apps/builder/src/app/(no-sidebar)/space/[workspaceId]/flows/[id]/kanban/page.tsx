import { flowService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowHubHeader } from "@/features/flows/components/flow-hub-header"
import { KanbanView } from "@/features/kanban/components/kanban-view"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

type FlowKanbanPageProps = {
  params: Promise<{ workspaceId: string; id: string }>
}

/** The flow's funnel: boards bound to this flow, scoped to its contacts. */
export default async function FlowKanbanPage({ params }: FlowKanbanPageProps) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  await requireContactsAccess(data.workspaceId)
  const contactPermissionScope = await requireContactPermissionScope(
    data.workspaceId,
  )

  const flow = await flowService.findBy({
    workspaceId: data.workspaceId,
    id: data.id,
  })
  if (!flow) {
    return notFound()
  }

  return (
    <div className="flex h-screen w-screen flex-col">
      <FlowHubHeader
        flowId={flow.id}
        flowName={flow.name}
        section="kanban"
        workspaceId={flow.workspaceId}
      />
      <div className="min-h-0 flex-1 p-4">
        <TagStoreProvider workspaceId={flow.workspaceId}>
          <CustomFieldStoreProvider workspaceId={flow.workspaceId}>
            <KanbanView
              canManageBoards={!contactPermissionScope.restrictToAssignedUserId}
              className="h-full"
              defaultTemplate="recruiting"
              flowId={flow.id}
              hideTitle
              workspaceId={flow.workspaceId}
            />
          </CustomFieldStoreProvider>
        </TagStoreProvider>
      </div>
    </div>
  )
}
