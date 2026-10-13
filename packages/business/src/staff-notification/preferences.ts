import type {
  WorkspaceMemberNotificationChannels,
  WorkspaceMemberNotificationTypes,
} from "@chatbotx.io/database/partials"

/**
 * Notification types a member can switch for the Telegram notifier. Each
 * maps onto a `WorkspaceMember.notificationTypes` key:
 * - `newMessageToHuman` — a contact wrote and no bot answered.
 * - `notifyAdmin` — the flow's "Notify staff" step, and triggers that hand a
 *   conversation to a human with "notify admins" on.
 * - `contactStuck` — a contact sits on one flow step past the threshold.
 */
export const staffNotificationTypeKeys = [
  "newMessageToHuman",
  "notifyAdmin",
  "contactStuck",
] as const
export type StaffNotificationType = (typeof staffNotificationTypeKeys)[number]

export type StaffNotificationTypes = Record<StaffNotificationType, boolean>

/**
 * The jsonb column defaults to `{}` and older rows predate `contactStuck`, so
 * a missing (or non-boolean) key means "on" — the same default new members
 * get. Delivery still needs an explicit Telegram link, so "on" by default
 * never messages anyone who did not opt in.
 */
export function resolveStaffNotificationTypes(
  raw: Partial<WorkspaceMemberNotificationTypes> | null | undefined,
): StaffNotificationTypes {
  const source = (raw ?? {}) as Record<string, unknown>
  const result = {} as StaffNotificationTypes
  for (const key of staffNotificationTypeKeys) {
    result[key] = source[key] !== false
  }
  return result
}

export type StaffRecipientCandidate = {
  id: string
  telegramChatId: string | null
  notificationChannels: Partial<WorkspaceMemberNotificationChannels> | null
  notificationTypes: Partial<WorkspaceMemberNotificationTypes> | null
}

/** Linked, Telegram channel not switched off, and the type enabled. */
export function isStaffRecipient(
  member: StaffRecipientCandidate,
  type: StaffNotificationType,
): boolean {
  if (!member.telegramChatId) {
    return false
  }
  if (member.notificationChannels?.telegram === false) {
    return false
  }
  return resolveStaffNotificationTypes(member.notificationTypes)[type]
}

export function selectStaffRecipients<T extends StaffRecipientCandidate>(
  members: readonly T[],
  type: StaffNotificationType,
): T[] {
  return members.filter((member) => isStaffRecipient(member, type))
}

export type MentionRecipientCandidate = Pick<
  StaffRecipientCandidate,
  "id" | "telegramChatId" | "notificationChannels"
> & { userId: string }

/**
 * Who gets a "you were mentioned" message: members the note mentions, never
 * the author, with Telegram linked and not switched off. A mention is a
 * personal message, so it does not depend on the notification types; members
 * without Telegram are returned as `unreachable` (there is no other staff
 * channel yet) so the caller can log the skip.
 */
export function selectMentionRecipients<T extends MentionRecipientCandidate>(
  members: readonly T[],
  props: { mentionedUserIds: readonly string[]; authorUserId: string },
): { recipients: T[]; unreachable: T[] } {
  const mentioned = new Set(props.mentionedUserIds)
  mentioned.delete(props.authorUserId)
  const recipients: T[] = []
  const unreachable: T[] = []
  const seen = new Set<string>()
  for (const member of members) {
    if (!mentioned.has(member.userId) || seen.has(member.userId)) {
      continue
    }
    seen.add(member.userId)
    if (
      member.telegramChatId &&
      member.notificationChannels?.telegram !== false
    ) {
      recipients.push(member)
    } else {
      unreachable.push(member)
    }
  }
  return { recipients, unreachable }
}
