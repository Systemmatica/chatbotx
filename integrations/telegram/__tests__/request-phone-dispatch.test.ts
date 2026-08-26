import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendTelegramMessage } = vi.hoisted(() => ({
  mockSendTelegramMessage: vi.fn(),
}))

vi.mock("../src/apis/bot", () => ({
  sendTelegramMessage: mockSendTelegramMessage,
  sendTelegramPhoto: vi.fn(),
  sendTelegramDocument: vi.fn(),
  sendTelegramAudio: vi.fn(),
  sendTelegramVideo: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = { auth: { secretText: "telegram-token" } } as never
const contact = { sourceId: "chat-1" } as never

describe("telegram sendFlowStep dispatches requestPhone/removeReplyKeyboard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendTelegramMessage.mockResolvedValue(555)
  })

  test("requestPhone step calls sendTelegramMessage with the native reply keyboard", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        flowId: "flow-1",
        step: {
          id: "step-1",
          stepType: "requestPhone",
          message: "Please share your phone number",
          buttonLabel: "Share phone number",
        },
      },
    } as never)

    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1)
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(ctx.auth, {
      chat_id: "chat-1",
      text: "Please share your phone number",
      reply_markup: {
        keyboard: [[{ text: "Share phone number", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    })
    expect(result).toEqual({ messageIds: ["555"] })
  })

  test("removeReplyKeyboard step calls sendTelegramMessage with ReplyKeyboardRemove", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        flowId: "flow-1",
        step: {
          id: "step-2",
          stepType: "removeReplyKeyboard",
          message: "Thanks!",
        },
      },
    } as never)

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(ctx.auth, {
      chat_id: "chat-1",
      text: "Thanks!",
      reply_markup: { remove_keyboard: true },
    })
    expect(result).toEqual({ messageIds: ["555"] })
  })

  test("unrecognized step type does not crash and sends nothing", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        flowId: "flow-1",
        step: { id: "step-3", stepType: "someFutureStepType" },
      },
    } as never)

    expect(mockSendTelegramMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: [] })
  })
})
