import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { LeadMagnetsView } from "@/features/lead-magnets/components/lead-magnets-view"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function LeadMagnetsPage(props: {
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
    <LeadMagnetsView
      canManage={!contactPermissionScope.restrictToAssignedUserId}
      workspaceId={workspaceId}
    />
  )
}
