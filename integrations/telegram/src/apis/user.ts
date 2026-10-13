import type { Context, IncomingContact } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { downloadTelegramFile } from "../apis/bot"
import { rescue } from "../exception"
import { createTelegramClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  TelegramApiResponse,
  TelegramAuthValue,
  TelegramChat,
  TelegramPhotoSize,
} from "../schema"

/**
 * Smallest edge (px) good enough for the contact avatar (rendered at 96 CSS px).
 * Telegram profile photos ship as 160/320/640 px squares.
 */
const AVATAR_MIN_SIZE = 160

/** Telegram profile photos are always JPEG; the file CDN replies octet-stream. */
const AVATAR_MIME_TYPE = "image/jpeg"

export const getUserProfile = ({
  ctx,
  psid,
}: {
  ctx: Context<TelegramAuthValue>
  psid: string
}): Promise<IncomingContact> =>
  rescue("getChat", async () => {
    const client = createTelegramClient(ctx.auth.secretText)
    const response = await client.get<TelegramApiResponse<TelegramChat>>(
      "getChat",
      { searchParams: { chat_id: String(psid) } },
    )
    const chat = response.result

    const contact: IncomingContact = {
      sourceId: String(psid),
      firstName: chat.first_name,
      lastName: chat.last_name,
    }

    const bio = chat.bio?.trim()
    if (bio) {
      contact.bio = bio
    }

    const avatar = await mirrorProfilePhoto(ctx, psid, chat)
    if (avatar) {
      contact.avatar = avatar
    }

    return contact
  })

/**
 * Mirrors the user's current profile photo into our public storage and
 * returns the storage path (resolved to a public URL by the frontend).
 *
 * Telegram file URLs embed the bot token and expire after ~1h, so they are
 * never returned or persisted. Fetched regardless of `username`: users
 * without one still have photos. Privacy-restricted users yield no photo —
 * that is a normal outcome, not an error.
 */
const mirrorProfilePhoto = async (
  ctx: Context<TelegramAuthValue>,
  psid: string,
  chat: TelegramChat,
): Promise<string | undefined> => {
  try {
    const fileId =
      chat.photo?.small_file_id ?? (await getProfilePhotoFileId(ctx.auth, psid))
    if (!fileId) {
      return
    }

    const file = await downloadTelegramFile(ctx.auth, fileId)
    if (!(file && file.bytes.byteLength > 0 && ctx.uploader)) {
      return
    }

    const originPath = `${ctx.storagePrefix}/avatars/${createId()}`
    await ctx.uploader.putObject(originPath, Buffer.from(file.bytes), {
      ACL: "public-read",
      ContentType: AVATAR_MIME_TYPE,
    })
    return originPath
  } catch (error) {
    // Error messages are token-redacted by the HTTP client; never log URLs.
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Telegram avatar mirror failed",
    )
    return
  }
}

const getProfilePhotoFileId = async (
  auth: TelegramAuthValue,
  psid: string,
): Promise<string | undefined> => {
  const client = createTelegramClient(auth.secretText)
  const response = await client.get<
    TelegramApiResponse<{ photos: TelegramPhotoSize[][] }>
  >("getUserProfilePhotos", {
    searchParams: { user_id: String(psid), limit: "1" },
  })
  const sizes = response.result.photos[0]
  return sizes ? pickAvatarSize(sizes)?.file_id : undefined
}

/** Smallest size that is still at least AVATAR_MIN_SIZE, else the largest. */
export const pickAvatarSize = (
  sizes: TelegramPhotoSize[],
): TelegramPhotoSize | undefined => {
  const ascending = [...sizes].sort((a, b) => a.width - b.width)
  return (
    ascending.find((size) => size.width >= AVATAR_MIN_SIZE) ?? ascending.at(-1)
  )
}
