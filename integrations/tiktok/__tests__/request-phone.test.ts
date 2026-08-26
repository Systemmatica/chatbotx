import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendTiktokMessage } = vi.hoisted(() => ({
  mockSendTiktokMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendTiktokMessage: mockSendTiktokMessage,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: { metadata: { openId: "biz-1" }, tokens: { accessToken: "tok" } },
} as never
const contact = {
  id: "contact-1",
  sourceId: "open-1",
  sourceConversationId: "conv-1",
} as never

describe("tiktok requestPhone/removeReplyKeyboard fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendTiktokMessage.mockResolvedValue("msg-1")
  })

  test("requestPhone falls back to a plain text prompt (no reply-keyboard mechanism)", async () => {
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

    expect(mockSendTiktokMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendTiktokMessage.mock.calls[0] as [
      unknown,
      { text?: { body?: string } },
    ]
    expect(payload.text?.body).toBe("Share your phone number")
    expect(result).toEqual({ messageIds: ["msg-1"] })
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

    expect(mockSendTiktokMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: [] })
  })
})
