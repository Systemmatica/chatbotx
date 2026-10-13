import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { SavedReplyStoreProvider } from "@/features/saved-replies/provider/saved-reply-store-context"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { ChatLayout } from "./chat-layout"
import type { ConversationFilters } from "./store/chat-store"
import { ChatStoreProvider } from "./store/chat-store-provider"

const DEFAULT_LAYOUT: [number, number, number] = [25, 50, 25]

const readSavedLayout = async (): Promise<[number, number, number]> => {
  const saved = (await cookies()).get("csm:layout:inbox")
  if (!saved) {
    return DEFAULT_LAYOUT
  }
  try {
    return JSON.parse(saved.value)
  } catch {
    return DEFAULT_LAYOUT
  }
}

/**
 * The inbox (conversation list, chat, contact panel) with every store it
 * needs. Shared by the workspace inbox and the flow hub's "Chats" tab, which
 * presets `initialFilters`. Callers check contacts access first.
 */
export async function InboxScreen({
  workspaceId,
  initialFilters,
  fillParent,
}: {
  workspaceId: string
  initialFilters?: ConversationFilters
  /** See {@link ChatLayout}'s `fillParent`. */
  fillParent?: boolean
}) {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }
  const canViewEmailAndPhone = canViewContactEmailAndPhone(
    userAndWorkspace.targetWorkspaceMember.permissions,
  )
  const savedLayout = await readSavedLayout()

  return (
    <ChatStoreProvider initialFilters={initialFilters}>
      <InboxStoreProvider workspaceId={workspaceId}>
        <UserStoreProvider workspaceId={workspaceId}>
          <CustomFieldStoreProvider workspaceId={workspaceId}>
            <SavedReplyStoreProvider
              autoInitialize={false}
              workspaceId={workspaceId}
            >
              <TagStoreProvider workspaceId={workspaceId}>
                <SequenceStoreProvider workspaceId={workspaceId}>
                  <FlowStoreProvider workspaceId={workspaceId}>
                    <ChatLayout
                      canViewEmailAndPhone={canViewEmailAndPhone}
                      fillParent={fillParent}
                      layout={savedLayout}
                      workspaceId={workspaceId}
                    />
                  </FlowStoreProvider>
                </SequenceStoreProvider>
              </TagStoreProvider>
            </SavedReplyStoreProvider>
          </CustomFieldStoreProvider>
        </UserStoreProvider>
      </InboxStoreProvider>
    </ChatStoreProvider>
  )
}
