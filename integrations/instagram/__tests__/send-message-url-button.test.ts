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

const { sendMessage } = await import("../src/handlers/message/outgoing-message")

const ctx = { auth: { tokens: { accessToken: "tok" } } } as never
const contact = { id: "contact-1", sourceId: "igsid-1" } as never

// Mirrors how apps/worker/src/chat/handlers/send-flow-step.ts's sendChatMessage
// persists a message with a "url" quick reply: the same button array ends up
// both in message.contentAttributes and in the top-level quickReplies param.
const longWebviewUrl = `https://app.example.com/booking/picker?token=${"a".repeat(
  1100,
)}`
const urlButton = {
  id: "qr-1",
  label: "Select Date",
  buttonType: "url" as const,
  url: longWebviewUrl,
  messengerExtensions: true,
}

describe("instagram sendMessage url-button routing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInstagramMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "ig_provider-1",
    })
  })

  test("renders a 'url' button as a web_url template button instead of a quick reply payload", async () => {
    await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-1",
          contentType: "text",
          text: "Choose an appointment time",
          contentAttributes: {
            type: "template",
            payload: { templateType: "button", buttons: [urlButton] },
          },
        },
        quickReplies: [urlButton],
      },
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendInstagramMessage.mock.calls[0] as [
      unknown,
      {
        message: {
          quick_replies?: unknown
          attachment?: {
            payload: { template_type: string; buttons: unknown[] }
          }
        }
      },
    ]

    expect(payload.message.quick_replies).toBeUndefined()
    expect(payload.message.attachment).toEqual(
      expect.objectContaining({
        type: "template",
        payload: expect.objectContaining({
          template_type: "button",
          buttons: [
            expect.objectContaining({
              type: "web_url",
              title: "Select Date",
              url: longWebviewUrl,
            }),
          ],
        }),
      }),
    )
  })
})
