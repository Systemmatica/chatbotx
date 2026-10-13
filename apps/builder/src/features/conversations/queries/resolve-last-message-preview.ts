import type { useTranslations } from "next-intl"
import { formattedTextToPlainText } from "@/features/messages/lib/formatted-text"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"

const EMPTY_PREVIEW = " "

export function resolveLastMessagePreview(
  message: MessageResourceWithRelations | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  if (message?.text) {
    // Outgoing bot text may carry HTML formatting; previews show it as plain
    // text. Incoming text is shown verbatim.
    return message.messageType === "outgoing"
      ? formattedTextToPlainText(message.text) || EMPTY_PREVIEW
      : message.text
  }

  const attachmentCount =
    message?.attachmentCount ?? message?.attachments?.length ?? 0
  if (attachmentCount > 0) {
    return t("messages.sentAttachments", { count: attachmentCount })
  }

  return EMPTY_PREVIEW
}
