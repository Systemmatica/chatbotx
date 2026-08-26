import {
  type Context,
  contentTypes,
  guessFileTypeFromMimeType,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageContactShareEntity,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { getTelegramFileUrl } from "../../apis/bot"
import { TelegramException } from "../../exception"
import { logger } from "../../lib/logger"
import type {
  TelegramAuthValue,
  TelegramContact,
  TelegramMessage,
  TelegramPhotoSize,
  TelegramUpdate,
} from "../../schema"
import { telegramUpdateSchema } from "../../schema"

/**
 * Telegram lets a user share ANY contact from their address book via a
 * `request_contact` reply-keyboard button — not necessarily their own. The
 * bot API sets `contact.user_id` to the shared contact's Telegram user id
 * only when that contact has one; comparing it against the message
 * sender's own id (`message.from.id`) is the only reliable "is this the
 * sender's own number" signal Telegram gives us.
 *
 * Policy for a mismatch (or a missing `user_id`, which Telegram omits for
 * contacts without a Telegram account and therefore can never be proven to
 * be the sender's own): `ownContact: false`. Callers must never write a
 * `false` contact's phone number into `Contact.phoneNumber` — see
 * `getMessageResult` below, which only forwards `phoneNumber` on the
 * top-level `IncomingContact` when `ownContact` is `true`. The contact-share
 * payload itself is still surfaced (via `contentAttributes`) so a flow can
 * choose to re-prompt ("please share your own number using the button") if
 * it wants to — the wait-for-reply validator
 * (`packages/business/src/get-user-data/reply-input.combinators.ts`'s
 * `fromContactShare`) rejects a foreign contact for exactly this reason, so
 * the flow does not silently advance on someone else's number either.
 */
const buildContactShare = (
  contact: TelegramContact,
  fromUserId: number | undefined,
): MessageContactShareEntity => ({
  type: "contact_share",
  phoneNumber: contact.phone_number,
  ownContact: contact.user_id !== undefined && contact.user_id === fromUserId,
  firstName: contact.first_name,
  lastName: contact.last_name,
  userId: contact.user_id === undefined ? undefined : String(contact.user_id),
  vcard: contact.vcard,
})

export const receiveMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<TelegramAuthValue>
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult> => {
  const update = telegramUpdateSchema.parse(data.payload)

  if (update.callback_query) {
    return receiveCallbackQuery(update)
  }

  if (!update.message) {
    throw new TelegramException("No message or callback_query in update")
  }

  return await getMessageResult(ctx, update.message)
}

const getMessageResult = async (
  ctx: Context<TelegramAuthValue>,
  message: TelegramMessage,
): Promise<ReceivedMessageResult> => {
  const contactId = String(message.from?.id ?? message.chat.id)

  const attachments = await getMessageAttachments(ctx, message)

  const contactShare = message.contact
    ? buildContactShare(message.contact, message.from?.id)
    : undefined

  const incomingMessage: IncomingMessage = {
    sourceId: String(message.message_id),
    messageType: messageTypes.enum.incoming,
    text: message.text ?? message.caption,
    contentType: contentTypes.enum.text,
    attachments,
    ...(contactShare ? { contentAttributes: contactShare } : {}),
  }

  const contact: IncomingContact = {
    sourceId: contactId,
    firstName: message.from?.first_name,
    lastName: message.from?.last_name,
    locale: message.from?.language_code,
    // Only the sender's OWN shared contact ever seeds `Contact.phoneNumber`
    // — see `buildContactShare`'s doc for why a mismatched/unprovable
    // `user_id` must never be treated as the sender's own number.
    ...(contactShare?.ownContact
      ? { phoneNumber: contactShare.phoneNumber }
      : {}),
  }

  // Calculate ref from /start command
  let ref: string | null = null
  if (message.text?.startsWith("/start")) {
    ref = message.text.split(" ")[1]
  }

  return {
    message: incomingMessage,
    contact,
    postbackAction: null,
    quickReplyAction: null,
    ref,
  }
}

const receiveCallbackQuery = (
  update: TelegramUpdate,
): ReceivedMessageResult => {
  const callbackQuery = update.callback_query
  if (!callbackQuery) {
    throw new TelegramException("Missing callback_query")
  }

  const userId = callbackQuery.from.id
  const chatId = callbackQuery.message?.chat.id ?? userId
  const payload = callbackQuery.data ?? ""

  const incomingMessage: IncomingMessage = {
    sourceId: String(callbackQuery.id),
    messageType: messageTypes.enum.incoming,
    text: payload,
    contentType: contentTypes.enum.text,
    attachments: [],
  }

  const contact: IncomingContact = {
    sourceId: String(chatId),
    firstName: callbackQuery.from.first_name,
    lastName: callbackQuery.from.last_name,
    locale: callbackQuery.from.language_code,
  }

  return {
    message: incomingMessage,
    contact,
    postbackAction: payload,
    quickReplyAction: null,
    ref: null,
  }
}

const getMessageAttachments = async (
  ctx: Context<TelegramAuthValue>,
  message: TelegramMessage,
): Promise<IncomingAttachment[]> => {
  const attachments: IncomingAttachment[] = []

  if (message.photo) {
    const largestPhoto = getLargestPhoto(message.photo)
    if (largestPhoto) {
      const attachment = await downloadAndUploadFile(
        ctx,
        largestPhoto.file_id,
        "image/jpeg",
      )
      if (attachment) {
        attachments.push(attachment)
      }
    }
  }

  if (message.document) {
    const attachment = await downloadAndUploadFile(
      ctx,
      message.document.file_id,
      message.document.mime_type ?? "application/octet-stream",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  if (message.audio) {
    const attachment = await downloadAndUploadFile(
      ctx,
      message.audio.file_id,
      message.audio.mime_type ?? "audio/mpeg",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  if (message.video) {
    const attachment = await downloadAndUploadFile(
      ctx,
      message.video.file_id,
      message.video.mime_type ?? "video/mp4",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  if (message.video_note) {
    // video_note (a Telegram "round" video message) never carries
    // file_name/mime_type — the Bot API always encodes it as mp4, so we hard
    // code the mime type instead of reading it off the payload like `video`
    // does. Everything downstream (storage, fileType detection, ai-speech-to-text)
    // follows the same contract as a regular `video` attachment.
    const attachment = await downloadAndUploadFile(
      ctx,
      message.video_note.file_id,
      "video/mp4",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  if (message.voice) {
    const attachment = await downloadAndUploadFile(
      ctx,
      message.voice.file_id,
      message.voice.mime_type ?? "audio/ogg",
    )
    if (attachment) {
      attachments.push(attachment)
    }
  }

  return attachments
}

const downloadAndUploadFile = async (
  ctx: Context<TelegramAuthValue>,
  fileId: string,
  mimeType: string,
): Promise<IncomingAttachment | null> => {
  try {
    const fileUrl = await getTelegramFileUrl(ctx.auth, fileId)
    if (!fileUrl) {
      return null
    }

    const response = await fetch(fileUrl)
    if (!(response.ok && response.body)) {
      return null
    }

    const bytes = await response.arrayBuffer()
    const originPath = `${ctx.storagePrefix}/${createId()}`

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return {
      sourceId: createId(),
      originPath,
      fileType: guessFileTypeFromMimeType(mimeType),
      mimeType,
      size: bytes.byteLength,
    }
  } catch (error) {
    logger.error(error, "downloadAndUploadFile error")
    return null
  }
}

const getLargestPhoto = (
  photos: TelegramPhotoSize[],
): TelegramPhotoSize | undefined =>
  photos.reduce<TelegramPhotoSize | undefined>((largest, photo) => {
    if (!largest) {
      return photo
    }
    return typeof photo.file_size === "number" &&
      typeof largest.file_size === "number" &&
      photo.file_size > largest.file_size
      ? photo
      : largest
  }, undefined)
