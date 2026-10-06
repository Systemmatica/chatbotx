import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { KanbanView } from "@/features/kanban/components/kanban-view"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function KanbanPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)
  const contactPermissionScope =
    await requireContactPermissionScope(workspaceId)

  return (
    <TagStoreProvider workspaceId={workspaceId}>
      <CustomFieldStoreProvider workspaceId={workspaceId}>
        <KanbanView
          canManageBoards={!contactPermissionScope.restrictToAssignedUserId}
          workspaceId={workspaceId}
        />
      </CustomFieldStoreProvider>
    </TagStoreProvider>
  )
}
