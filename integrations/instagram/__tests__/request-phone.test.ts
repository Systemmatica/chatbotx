import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendInstagramMessage } = vi.hoisted(() => ({
  mockSendInstagramMessage: vi.fn(),
}))

vi.mock("../src/apis/page", () => ({
  sendInstagramMessage: mockSendInstagramMessage,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = { auth: { tokens: { accessToken: "tok" } } } as never
const contact = { id: "contact-1", sourceId: "igsid-1" } as never

describe("instagram requestPhone/removeReplyKeyboard fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInstagramMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "ig_provider-1",
    })
  })

  test("requestPhone falls back to a plain text prompt (no native contact-share UI on Instagram DMs)", async () => {
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

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendInstagramMessage.mock.calls[0] as [
      unknown,
      { message: { text?: string } },
    ]
    expect(payload.message.text).toBe("Share your phone number")
    expect(result).toEqual({ messageIds: ["ig_provider-1"] })
  })

  test("removeReplyKeyboard is a deliberate no-op (no reply-keyboard concept on Instagram)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: { id: "step-2", stepType: "removeReplyKeyboard", message: "" },
      },
    } as never)

    expect(mockSendInstagramMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: [] })
  })
})
