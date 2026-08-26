import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockGetWhatsappClient, mockSendMessage } = vi.hoisted(() => {
  const sendMessage = vi.fn()
  return {
    mockGetWhatsappClient: vi.fn(() => ({ sendMessage })),
    mockSendMessage: sendMessage,
  }
})

vi.mock("../src/client", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const PHONE_NUMBER_ID = "pn-1"
const ctx = {
  auth: { metadata: { phoneNumber: { id: PHONE_NUMBER_ID } } },
} as never
const contact = { id: "contact-1", sourceId: "84123456789" } as never

const sendStep = (step: Record<string, unknown>) =>
  sendFlowStep({
    ctx,
    data: { contact, flowId: "flow-1", step },
  } as never)

describe("whatsapp requestPhone/removeReplyKeyboard fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.provider-1" }],
    })
  })

  test("requestPhone falls back to a plain text prompt (no native reply-keyboard mechanism)", async () => {
    const result = await sendStep({
      id: "step-1",
      stepType: "requestPhone",
      message: "Share your phone number",
      buttonLabel: "Share",
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [, , textMessage] = mockSendMessage.mock.calls[0] as [
      unknown,
      unknown,
      { body: string },
    ]
    expect(textMessage.body).toBe("Share your phone number")
    expect(result).toEqual({ messageIds: ["wamid.provider-1"] })
  })

  test("removeReplyKeyboard is a deliberate no-op (no reply-keyboard concept)", async () => {
    const result = await sendStep({
      id: "step-2",
      stepType: "removeReplyKeyboard",
      message: "",
    })

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: [] })
  })
})
