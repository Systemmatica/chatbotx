import { beforeEach, describe, expect, test, vi } from "vitest"

const { isBotCommand, resolveIncomingTextRouting } = await import(
  "../src/integration/routing"
)

const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  additionalAttributes: {},
}

const challengeConversation = {
  ...conversation,
  additionalAttributes: {
    challenge: { type: "step", data: { stepId: "step-1" } },
  },
}

describe("resolveIncomingTextRouting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("does not route pending challenges when bot automation is inactive", async () => {
    const isConversationActive = vi.fn(async () => false)

    await expect(
      resolveIncomingTextRouting({
        conversation: challengeConversation as never,
        hasActionableInput: true,
        hasText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "humanMode",
      conversation: challengeConversation,
    })

    expect(isConversationActive).toHaveBeenCalledWith(challengeConversation)
  })

  test("routes pending challenges after bot automation is confirmed active", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: challengeConversation as never,
        hasActionableInput: true,
        hasText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "challenge",
      conversation: challengeConversation,
      challenge: challengeConversation.additionalAttributes.challenge,
    })
  })

  test("routes an attachment-only reply to a pending challenge", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: challengeConversation as never,
        // An uploaded image/file/voice carries actionable input but no text.
        hasActionableInput: true,
        hasText: false,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "challenge",
      conversation: challengeConversation,
      challenge: challengeConversation.additionalAttributes.challenge,
    })
  })

  test("routes automated response only when there is no challenge and bot automation is active", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        hasActionableInput: true,
        hasText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "automatedResponse",
      conversation,
    })
  })

  test("does not route attachment-only messages to automated response without a challenge", async () => {
    const isConversationActive = vi.fn(async () => true)

    // No challenge is pending, so an attachment with no text has nothing to
    // drive: automated (AI) replies stay text-only.
    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        hasActionableInput: true,
        hasText: false,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "none" })
  })

  test("skips messages with no actionable input without checking bot automation", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        hasActionableInput: false,
        hasText: false,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "none" })

    expect(isConversationActive).not.toHaveBeenCalled()
  })

  test("a bot command overrides a pending challenge and clears it", async () => {
    await expect(
      resolveIncomingTextRouting({
        conversation: challengeConversation as never,
        hasActionableInput: true,
        hasText: true,
        text: "/start",
        isConversationActive: async () => true,
      }),
    ).resolves.toEqual({
      type: "automatedResponse",
      conversation: challengeConversation,
      clearsChallenge: true,
    })
  })

  test("plain text still answers a pending challenge", async () => {
    await expect(
      resolveIncomingTextRouting({
        conversation: challengeConversation as never,
        hasActionableInput: true,
        hasText: true,
        text: "Никита / CEO",
        isConversationActive: async () => true,
      }),
    ).resolves.toMatchObject({ type: "challenge" })
  })

  test("recognises Telegram bot commands only", () => {
    expect(isBotCommand("/start")).toBe(true)
    expect(isBotCommand(" /start ref_42")).toBe(true)
    expect(isBotCommand("/help@my_bot")).toBe(true)
    expect(isBotCommand("1/2")).toBe(false)
    expect(isBotCommand("/ ")).toBe(false)
    expect(isBotCommand("https://x.y/start")).toBe(false)
    expect(isBotCommand(null)).toBe(false)
  })
})
