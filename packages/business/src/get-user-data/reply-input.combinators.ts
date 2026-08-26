import type { FileType } from "@chatbotx.io/database/partials"
import { getContactShare } from "@chatbotx.io/sdk"
import type {
  ReplyInputKind,
  ReplyValidationResult,
  ReplyValidator,
  TextCheck,
} from "./reply-input.types"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?(\d[\d-. ]+)?(\([\d-. ]+\))?[\d-. ]+\d$/

export function accepted(
  userInput: string,
  kind: ReplyInputKind = "text",
): ReplyValidationResult {
  return { ok: true, userInput, kind }
}

export function rejected(reason: string): ReplyValidationResult {
  return { ok: false, errorMessage: reason }
}

export function fromText(check: TextCheck): ReplyValidator {
  return (message) => {
    if (!message.text) {
      return rejected("getUserData: expected text input")
    }

    return check(message.text)
  }
}

export function fromTextWhenAttachmentAbsent(check: TextCheck): ReplyValidator {
  return (message) => {
    if (message.attachments.length > 0) {
      return rejected("getUserData: unsupported file type")
    }

    return fromText(check)(message)
  }
}

export function fromAttachment(
  accept: (fileType: FileType) => boolean,
): ReplyValidator {
  return (message) => {
    const file = message.attachments[0]

    if (!file) {
      return rejected("getUserData: expected a file attachment")
    }

    if (!accept(file.fileType)) {
      return rejected("getUserData: unsupported file type")
    }

    return accepted(file.originPath, "attachment")
  }
}

export const fromLocation: ReplyValidator = (message) => {
  if (message.contentType !== "location") {
    return rejected("getUserData: expected a location")
  }

  const attrs = message.contentAttributes ?? {}
  const latitude = Number(attrs.latitude ?? attrs.lat)
  const longitude = Number(attrs.longitude ?? attrs.long)

  if (!(Number.isFinite(latitude) && Number.isFinite(longitude))) {
    return rejected("getUserData: invalid location")
  }

  return accepted(`${latitude},${longitude}`, "location")
}

/**
 * Validates a native contact-share reply (e.g. Telegram's `request_contact`
 * button send-back) stored on `contentAttributes` — see
 * `MessageContactShareEntity` in `packages/sdk`. Rejects a contact whose
 * `ownContact` flag is `false`: the sender shared someone else's contact
 * card (or a contact Telegram cannot prove is their own), and that number
 * must never be accepted as the sender's own phone number, matching the
 * incoming Telegram handler's own policy of not writing such a number into
 * `Contact.phoneNumber` either.
 */
export const fromContactShare: ReplyValidator = (message) => {
  const contactShare = getContactShare(message.contentAttributes)

  if (!contactShare) {
    return rejected("getUserData: expected a shared contact")
  }

  if (!contactShare.ownContact) {
    return rejected(
      "getUserData: shared contact is not the sender's own — please share your own number",
    )
  }

  return accepted(contactShare.phoneNumber, "contact")
}

export function firstAccepted(...validators: ReplyValidator[]): ReplyValidator {
  return (message) => {
    let lastRejection: ReplyValidationResult | undefined

    for (const validate of validators) {
      const result = validate(message)

      if (result.ok) {
        return result
      }

      lastRejection = result
    }

    if (lastRejection) {
      return lastRejection
    }

    return rejected("getUserData: no supported input received")
  }
}

export function matches(pattern: RegExp, reason: string): TextCheck {
  return (text) => {
    if (!pattern.test(text)) {
      return rejected(reason)
    }

    return accepted(text)
  }
}

export const asNumber: TextCheck = (text) => {
  if (Number.isNaN(Number.parseFloat(text))) {
    return rejected("getUserData: invalid number")
  }

  return accepted(text)
}

export const asEmail: TextCheck = matches(
  EMAIL_PATTERN,
  "getUserData: invalid email address",
)

export const asPhone: TextCheck = matches(
  PHONE_PATTERN,
  "getUserData: invalid phone number",
)

export const asUrl: TextCheck = (text) => {
  try {
    new URL(text)
    return accepted(text)
  } catch {
    return rejected("getUserData: invalid link")
  }
}

export const asIsoDate: TextCheck = (text) => {
  const date = new Date(text)

  if (Number.isNaN(date.getTime())) {
    return rejected("getUserData: invalid date")
  }

  return accepted(date.toISOString())
}

export const asIs: TextCheck = (text) => accepted(text)
