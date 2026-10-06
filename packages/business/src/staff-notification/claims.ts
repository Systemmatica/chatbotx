import type { StaffNotifierStore } from "./store"

/** At most one "contact wrote" notification per conversation in this window. */
export const INCOMING_MESSAGE_DEBOUNCE_SECONDS = 10 * 60

/**
 * A "stuck" claim must outlive the scan look-back window (so a row seen on
 * several scans is reported once) — two weeks is far beyond it.
 */
export const STUCK_CLAIM_TTL_SECONDS = 14 * 24 * 60 * 60

export const incomingMessageClaimKey = (conversationId: string): string =>
  `staff-notifier:incoming:${conversationId}`

/**
 * Keyed by the exact recorded position: a contact that moves on and later
 * gets stuck again (new node, or the same node re-entered → new timestamp)
 * produces a new key, while repeated scans of the same stale row do not.
 */
export const stuckClaimKey = (props: {
  contactInboxId: string
  flowId: string
  nodeId: string
  reachedAt: Date
}): string =>
  `staff-notifier:stuck:${props.contactInboxId}:${props.flowId}:${props.nodeId}:${props.reachedAt.getTime()}`

/** True for the first caller in the window, false for everyone after. */
export async function claimIncomingMessageNotification(
  store: StaffNotifierStore,
  conversationId: string,
): Promise<boolean> {
  return await store.setIfAbsent(
    incomingMessageClaimKey(conversationId),
    "1",
    INCOMING_MESSAGE_DEBOUNCE_SECONDS,
  )
}

export async function claimStuckNotification(
  store: StaffNotifierStore,
  props: Parameters<typeof stuckClaimKey>[0],
): Promise<boolean> {
  return await store.setIfAbsent(
    stuckClaimKey(props),
    "1",
    STUCK_CLAIM_TTL_SECONDS,
  )
}
