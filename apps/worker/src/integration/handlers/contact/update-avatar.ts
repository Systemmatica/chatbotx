import { and, db, eq, isNull, or } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import type { IntegrationJobUpdateContactAvatar } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import {
  allIntegrations,
  resolveIntegrationContextFromContactInbox,
} from "../../../services/integrations"
import { isStaleAvatar } from "./profile-refresh"

/**
 * Mirror a contact's channel avatar URL to our object storage and persist the
 * resulting storage path on the Contact row (plus the profile bio, when the
 * channel returns one and none is stored yet).
 *
 * Dispatched per-contact after Coexist historical sync creates contacts from
 * `/me/conversations` participants (which carry only `id` + `name`, no
 * `profile_pic`), and — throttled — on inbound messages from existing
 * contacts whose avatar is missing or stale (see `profile-refresh.ts`).
 * Idempotent: skips when a valid avatar is already set so a re-run never
 * overwrites a live-set or previously-mirrored avatar; only a missing or
 * stale (expiring, token-bearing channel URL) avatar is replaced.
 */
export const updateContactAvatar = async (
  data: IntegrationJobUpdateContactAvatar["data"],
): Promise<void> => {
  const { workspaceId, contactInboxId, sourceId } = data

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: { id: contactInboxId },
  })
  if (!contactInbox) {
    logger.warn({ contactInboxId }, "[update-avatar] ContactInbox not found")
    return
  }

  const contact = await db.query.contactModel.findFirst({
    where: { id: contactInbox.contactId },
    columns: { id: true, avatar: true, bio: true },
  })
  if (!contact) {
    logger.warn(
      { contactId: contactInbox.contactId },
      "[update-avatar] Contact not found",
    )
    return
  }
  const staleAvatar = isStaleAvatar(contact.avatar) ? contact.avatar : null
  if (contact.avatar && !staleAvatar) {
    return
  }

  const integration = allIntegrations[contactInbox.channel]
  if (!integration) {
    return
  }

  let avatar: string | undefined
  let bio: string | undefined
  try {
    const { ctx } = await resolveIntegrationContextFromContactInbox({
      workspaceId,
      contactInbox,
    })
    const profile = await integration.runChannelHandler(
      "contact",
      "getProfile",
      { ctx, data: { sourceId } },
    )
    avatar = profile?.avatar
    bio = profile?.bio
  } catch (error) {
    logger.warn(
      { error, contactInboxId, sourceId, channel: contactInbox.channel },
      "[update-avatar] getProfile failed",
    )
    return
  }

  if (bio && !contact.bio) {
    await db
      .update(contactModel)
      .set({ bio, updatedAt: new Date() })
      .where(and(eq(contactModel.id, contact.id), isNull(contactModel.bio)))
  }

  if (avatar) {
    // Only replace what we read: an empty avatar, or the exact stale URL.
    // A concurrent writer that already stored a fresh avatar wins.
    const avatarUnchanged = staleAvatar
      ? or(isNull(contactModel.avatar), eq(contactModel.avatar, staleAvatar))
      : isNull(contactModel.avatar)
    await db
      .update(contactModel)
      .set({ avatar, updatedAt: new Date() })
      .where(and(eq(contactModel.id, contact.id), avatarUnchanged))
    return
  }

  if (staleAvatar) {
    // The channel no longer exposes a photo (privacy/removed): drop the
    // expiring token-bearing URL rather than keep serving it.
    await db
      .update(contactModel)
      .set({ avatar: null, updatedAt: new Date() })
      .where(
        and(
          eq(contactModel.id, contact.id),
          eq(contactModel.avatar, staleAvatar),
        ),
      )
  }
}
