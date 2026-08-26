import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendPageMessage } = vi.hoisted(() => ({
  mockSendPageMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendPageMessage: mockSendPageMessage,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: { tokens: { accessToken: "tok" }, version: "v20.0" },
  integrationDetail: { personaId: undefined },
} as never

const contact = {
  id: "contact-1",
  sourceId: "psid-1",
  lastIncomingMessageAt: new Date("2026-06-23T09:00:00.000Z"),
} as never

describe("messenger requestPhone/removeReplyKeyboard fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_provider-1",
    })
  })

  test("requestPhone renders Messenger's native user_phone_number quick reply, no crash", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: {
          id: "step-1",
          stepType: "requestPhone",
          message: "Share your phone number",
          buttonLabel: "Share",
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0] as [
      unknown,
      { message: { text: string; quick_replies: unknown[] } },
    ]
    expect(payload.message.text).toBe("Share your phone number")
    expect(payload.message.quick_replies).toEqual([
      { content_type: "user_phone_number" },
    ])
    expect(result).toEqual({ messageIds: ["m_provider-1"] })
  })

  test("removeReplyKeyboard is a deliberate no-op (no reply-keyboard concept on Messenger)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: { id: "step-2", stepType: "removeReplyKeyboard", message: "" },
      },
    } as never)

    expect(mockSendPageMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: [] })
  })
})
