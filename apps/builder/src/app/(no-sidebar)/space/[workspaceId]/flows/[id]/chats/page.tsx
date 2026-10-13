import { flowService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { InboxScreen } from "@/features/chat/inbox-screen"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schemas"
import { FlowHubHeader } from "@/features/flows/components/flow-hub-header"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

type FlowChatsPageProps = {
  params: Promise<{ workspaceId: string; id: string }>
}

/** The inbox inside the flow hub, pre-filtered to contacts currently in it. */
export default async function FlowChatsPage({ params }: FlowChatsPageProps) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  await requireContactsAccess(data.workspaceId)

  const flow = await flowService.findBy({
    workspaceId: data.workspaceId,
    id: data.id,
  })
  if (!flow) {
    return notFound()
  }

  const contactFilter = contactFilterCriteriaSchema.parse({
    operator: "and",
    conditions: [{ field: "currentFlow", operator: "eq", value: flow.id }],
  })

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <FlowHubHeader
        flowId={flow.id}
        flowName={flow.name}
        section="chats"
        workspaceId={flow.workspaceId}
      />
      <div className="min-h-0 flex-1">
        <InboxScreen
          fillParent
          initialFilters={{ contactFilter }}
          workspaceId={flow.workspaceId}
        />
      </div>
    </div>
  )
}
