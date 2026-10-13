import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

/**
 * Channels whose existing contacts get their profile (avatar/bio) re-fetched
 * on a later inbound message when the stored avatar is missing or stale.
 * Other channels only fetch the profile once, at contact creation.
 */
const PROFILE_REFRESH_CHANNELS: ReadonlySet<string> = new Set(["telegram"])

/** At most one refresh attempt per contact inbox within this window. */
export const PROFILE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Legacy Telegram avatars were stored as Bot API file URLs: they embed the
 * bot token and expire after ~1h, so they must be replaced by a mirrored
 * storage path.
 */
const STALE_AVATAR_URL_PREFIX = "https://api.telegram.org/file/bot"

export const isStaleAvatar = (avatar: string | null | undefined): boolean =>
  Boolean(avatar?.startsWith(STALE_AVATAR_URL_PREFIX))

export const needsProfileRefresh = (
  channel: string,
  contact: { avatar: string | null },
): boolean =>
  PROFILE_REFRESH_CHANNELS.has(channel) &&
  (!contact.avatar || isStaleAvatar(contact.avatar))

/**
 * Enqueue an `updateContactAvatar` job for an existing contact whose avatar
 * is missing or stale. Throttled per contact inbox via BullMQ deduplication
 * (throttle mode: further adds with the same id are dropped until the TTL
 * expires, even after the job completed), so the channel API is hit at most
 * once per {@link PROFILE_REFRESH_INTERVAL_MS} no matter how many messages
 * arrive. Never throws — a failed enqueue must not break message intake.
 */
export const scheduleProfileRefreshIfNeeded = async (props: {
  channel: string
  workspaceId: string
  contactInboxId: string
  sourceId: string
  contact: { avatar: string | null }
}): Promise<void> => {
  const { channel, workspaceId, contactInboxId, sourceId, contact } = props
  if (!needsProfileRefresh(channel, contact)) {
    return
  }

  try {
    await integrationQueue.add(
      IntegrationJobAction.updateContactAvatar,
      {
        type: IntegrationJobAction.updateContactAvatar,
        data: { workspaceId, contactInboxId, sourceId },
      },
      {
        deduplication: {
          id: `refresh-profile-${contactInboxId}`,
          ttl: PROFILE_REFRESH_INTERVAL_MS,
        },
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    )
  } catch (error) {
    logger.warn(
      { error, contactInboxId, channel },
      "[profile-refresh] failed to enqueue profile refresh",
    )
  }
}
