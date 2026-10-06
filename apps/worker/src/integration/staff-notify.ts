/**
 * What the staff notification quotes for an incoming contact message: its
 * text, or a neutral marker for attachment/location-only messages (the
 * staff text itself is localized when it is rendered).
 */
export function describeIncomingForStaff(message: {
  text?: string | null
  contentType?: string | null
  attachments?: readonly unknown[] | null
}): string {
  const text = message.text?.trim()
  if (text) {
    return text
  }
  if (message.contentType === "location") {
    return "📍"
  }
  return (message.attachments?.length ?? 0) > 0 ? "📎" : ""
}
