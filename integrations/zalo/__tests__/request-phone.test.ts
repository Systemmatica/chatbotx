import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendMessageToZaloOA } = vi.hoisted(() => ({
  mockSendMessageToZaloOA: vi.fn(),
}))

vi.mock("../src/api/message", () => ({
  sendMessageToZaloOA: mockSendMessageToZaloOA,
  uploadAttachment: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = { auth: { tokens: { accessToken: "tok" } } } as never
const contact = { id: "contact-1", sourceId: "zalo-uid-1" } as never

describe("zalo requestPhone/removeReplyKeyboard fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessageToZaloOA.mockResolvedValue({
      error: 0,
      message: "Success",
      data: { message_id: "m_provider-1" },
    })
  })

  test("requestPhone falls back to a plain text prompt (no native reply-keyboard mechanism)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        flowId: "flow-1",
        step: {
          id: "step-1",
          stepType: "requestPhone",
          message: "Share your phone number",
          buttonLabel: "Share",
        },
      },
    } as never)

    expect(mockSendMessageToZaloOA).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendMessageToZaloOA.mock.calls[0] as [
      unknown,
      { message: { text?: string } },
    ]
    expect(payload.message.text).toBe("Share your phone number")
    expect(result).toEqual({ messageIds: ["m_provider-1"] })
  })

  test("removeReplyKeyboard is a deliberate no-op (no reply-keyboard concept)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        flowId: "flow-1",
        step: { id: "step-2", stepType: "removeReplyKeyboard", message: "" },
      },
    } as never)

    expect(mockSendMessageToZaloOA).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: [] })
  })
})
