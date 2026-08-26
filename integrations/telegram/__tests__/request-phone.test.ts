import type { RequestPhoneStepSchema } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  buildRequestContactKeyboard,
  convertFlowStepRemoveReplyKeyboard,
  convertFlowStepRequestPhone,
} from "../src/handlers/message/outgoing-message/send-request-phone"

const baseStep: RequestPhoneStepSchema = {
  id: "step-1",
  stepType: "requestPhone",
  message: "Please share your phone number",
  buttonLabel: "Share phone number",
}

describe("telegram requestPhone (outgoing)", () => {
  test("builds a real reply-keyboard with request_contact, resize and one-time flags", () => {
    const keyboard = buildRequestContactKeyboard("Share phone number")

    expect(keyboard).toEqual({
      keyboard: [[{ text: "Share phone number", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    })
  })

  test("convertFlowStepRequestPhone sends the message text with the native reply keyboard", () => {
    const [payload] = Array.from(
      convertFlowStepRequestPhone({
        data: {
          contact: { sourceId: "chat-1" },
          step: baseStep,
        },
      } as never),
    )

    expect(payload).toEqual({
      chat_id: "chat-1",
      text: "Please share your phone number",
      reply_markup: {
        keyboard: [[{ text: "Share phone number", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    })
    // Not an inline keyboard — a reply keyboard has no `callback_data` and
    // is a fundamentally different Telegram object.
    expect(payload.reply_markup).not.toHaveProperty("inline_keyboard")
  })

  test("convertFlowStepRemoveReplyKeyboard sends a ReplyKeyboardRemove", () => {
    const [payload] = Array.from(
      convertFlowStepRemoveReplyKeyboard({
        data: {
          contact: { sourceId: "chat-1" },
          step: { id: "step-2", stepType: "removeReplyKeyboard", message: "" },
        },
      } as never),
    )

    expect(payload.reply_markup).toEqual({ remove_keyboard: true })
    // Telegram requires non-empty text on every sendMessage call.
    expect(payload.text.length).toBeGreaterThan(0)
  })

  test("convertFlowStepRemoveReplyKeyboard keeps a configured message", () => {
    const [payload] = Array.from(
      convertFlowStepRemoveReplyKeyboard({
        data: {
          contact: { sourceId: "chat-1" },
          step: {
            id: "step-2",
            stepType: "removeReplyKeyboard",
            message: "Thanks!",
          },
        },
      } as never),
    )

    expect(payload).toEqual({
      chat_id: "chat-1",
      text: "Thanks!",
      reply_markup: { remove_keyboard: true },
    })
  })
})
