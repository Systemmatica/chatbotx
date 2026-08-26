import { describe, expect, test } from "vitest"
import {
  getUserDataStepDefaultFn,
  getUserDataStepSchema,
  ReplyFormat,
  removeReplyKeyboardStepDefaultFn,
  removeReplyKeyboardStepSchema,
  requestPhoneStepDefaultFn,
  requestPhoneStepSchema,
  sendMessageNodeDefaultFn,
  sendMessageNodeSchema,
} from "../src"

describe("requestPhoneStepSchema", () => {
  // Mirrors `sendTextStepDefaultFn`'s blank-canvas default: `message`
  // defaults to "" for a freshly-added builder step, which requires the
  // author to fill it in before the flow validates — same as sendText.
  test("default step with a message filled in is valid", () => {
    const value = requestPhoneStepDefaultFn({ message: "Share your number" })
    expect(requestPhoneStepSchema.safeParse(value).success).toBe(true)
  })

  test("accepts a configured message and button label", () => {
    const value = requestPhoneStepDefaultFn({
      message: "Share your phone to continue",
      buttonLabel: "Share number",
    })

    const result = requestPhoneStepSchema.safeParse(value)
    expect(result.success).toBe(true)
  })

  test("rejects an empty message", () => {
    const value = { ...requestPhoneStepDefaultFn(), message: "" }
    expect(requestPhoneStepSchema.safeParse(value).success).toBe(false)
  })

  test("rejects an empty button label", () => {
    const value = { ...requestPhoneStepDefaultFn(), buttonLabel: "" }
    expect(requestPhoneStepSchema.safeParse(value).success).toBe(false)
  })

  test("rejects a button label longer than the max", () => {
    const value = {
      ...requestPhoneStepDefaultFn(),
      buttonLabel: "x".repeat(21),
    }
    expect(requestPhoneStepSchema.safeParse(value).success).toBe(false)
  })
})

describe("removeReplyKeyboardStepSchema", () => {
  test("default step is valid", () => {
    expect(
      removeReplyKeyboardStepSchema.safeParse(
        removeReplyKeyboardStepDefaultFn(),
      ).success,
    ).toBe(true)
  })

  test("message is optional", () => {
    const { message: _message, ...withoutMessage } =
      removeReplyKeyboardStepDefaultFn()
    expect(
      removeReplyKeyboardStepSchema.safeParse(withoutMessage).success,
    ).toBe(true)
  })
})

describe("sendMessage node accepts the new steps", () => {
  test("requestPhone and removeReplyKeyboard are valid members of the steps union", () => {
    const node = sendMessageNodeDefaultFn({
      detailProps: {
        steps: [
          requestPhoneStepDefaultFn({ message: "Share your number" }),
          removeReplyKeyboardStepDefaultFn(),
        ],
      },
    })

    expect(sendMessageNodeSchema.safeParse(node).success).toBe(true)
  })
})

describe("getUserData ReplyFormat.phoneContact", () => {
  test("RF12 is a valid replyFormat on getUserData", () => {
    const value = {
      ...getUserDataStepDefaultFn(),
      message: "What's your phone number?",
      replyFormat: ReplyFormat.phoneContact,
      outputFieldId: "phone",
    }

    expect(getUserDataStepSchema.safeParse(value).success).toBe(true)
  })
})
