import {
  type BroadcastTarget,
  broadcastToGuestParty as broadcastToGuestPartyLow,
  broadcastToWorkspaceParty as broadcastToWorkspacePartyLow,
  type RealtimeEventData,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import { logger } from "../logger"
import { resolveBroadcastSecret, resolveTenantSettings } from "./settings"

const resolveTargetByWorkspace = async (
  workspaceId: string,
): Promise<BroadcastTarget> => {
  const [{ wsUrl }, secret] = await Promise.all([
    resolveTenantSettings({ workspaceId }),
    Promise.resolve(resolveBroadcastSecret({ workspaceId })),
  ])
  return { url: wsUrl, secret }
}

export const broadcastToWorkspaceParty = async (
  workspaceId: string,
  json: RealtimeEventData,
) => {
  const target = await resolveTargetByWorkspace(workspaceId)
  return broadcastToWorkspacePartyLow(target, workspaceId, json)
}

export const broadcastToGuestParty = async (
  args: { workspaceId: string; guestConversationId: string },
  json: RealtimeEventData,
) => {
  const target = await resolveTargetByWorkspace(args.workspaceId)
  return broadcastToGuestPartyLow(target, args.guestConversationId, json)
}

/**
 * Tell open inbox panels that a contact's tags changed, so tag-derived data
 * (tag list, received lead magnets) refreshes without reopening the chat.
 * Best effort: never throws, a missed event only means a stale panel.
 */
export const publishContactTagsChanged = async (input: {
  workspaceId: string
  contactId: string
  tagIds: string[]
}): Promise<void> => {
  if (input.tagIds.length === 0) {
    return
  }
  try {
    await broadcastToWorkspaceParty(input.workspaceId, {
      eventType: RealtimeEventType.contactTagsChanged,
      data: { contactId: input.contactId, tagIds: input.tagIds },
    })
  } catch (error) {
    logger.warn(
      { err: error, workspaceId: input.workspaceId },
      "Failed to publish contactTagsChanged",
    )
  }
}
