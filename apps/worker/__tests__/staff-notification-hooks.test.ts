import { stepTypes } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockIsConfigured, mockNotifyStepReached, mockGetAll, mockReplaceAll } =
  vi.hoisted(() => ({
    mockIsConfigured: vi.fn(() => true),
    mockNotifyStepReached: vi.fn().mockResolvedValue(undefined),
    mockGetAll: vi.fn().mockResolvedValue({ user_name: "Ann" }),
    mockReplaceAll: vi.fn(
      async ({ text }: { text: string }) =>
        await Promise.resolve(text.replace("{{user_name}}", "Ann")),
    ),
  }))

vi.mock("@chatbotx.io/business", () => ({
  staffNotificationService: {
    isConfigured: mockIsConfigured,
    notifyStepReached: mockNotifyStepReached,
  },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: mockGetAll,
    replaceAll: mockReplaceAll,
  },
}))

const { notifyAgent } = await import("../src/integration/handlers/notify-agent")
const { describeIncomingForStaff } = await import(
  "../src/integration/staff-notify"
)

const props = {
  conversation: { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" },
  contactInbox: { id: "ci-1" },
  step: {
    id: "1",
    stepType: stepTypes.enum.notifyAgent,
    text: "{{user_name}} reached payment",
  },
} as never

describe("notifyAgent flow step", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsConfigured.mockReturnValue(true)
  })

  test("renders variables and enqueues a staff notification", async () => {
    await notifyAgent(props)

    expect(mockGetAll).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "c-1" }),
    )
    expect(mockNotifyStepReached).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      text: "Ann reached payment",
    })
  })

  test("is a no-op when the notifier bot is not configured", async () => {
    mockIsConfigured.mockReturnValue(false)

    await notifyAgent(props)

    expect(mockGetAll).not.toHaveBeenCalled()
    expect(mockNotifyStepReached).not.toHaveBeenCalled()
  })
})

describe("describeIncomingForStaff", () => {
  test("quotes text, marks attachment- and location-only messages", () => {
    expect(describeIncomingForStaff({ text: "  hi  " })).toBe("hi")
    expect(
      describeIncomingForStaff({ text: "", attachments: [{ id: 1 }] }),
    ).toBe("📎")
    expect(
      describeIncomingForStaff({ text: null, contentType: "location" }),
    ).toBe("📍")
    expect(describeIncomingForStaff({ text: null, attachments: [] })).toBe("")
  })
})
