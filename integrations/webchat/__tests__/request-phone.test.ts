import { describe, expect, test } from "vitest"
import { sendFlowStep } from "../src/handlers/message"

describe("webchat requestPhone/removeReplyKeyboard fallback", () => {
  // Webchat's sendFlowStep is already a no-op for every step type
  // (pre-existing behavior, not specific to these two steps) — no native
  // contact-share/reply-keyboard mechanism and no plain-text fallback
  // channel to fall back to here either, since webchat's flow-step sending
  // was never wired up. Confirms it stays a safe no-op, never a crash.
  test("requestPhone does not crash and sends nothing", async () => {
    const result = await sendFlowStep({
      ctx: {} as never,
      data: {
        contact: { id: "contact-1", sourceId: "guest-1" },
        step: {
          id: "step-1",
          stepType: "requestPhone",
          message: "Share your phone number",
          buttonLabel: "Share",
        },
      },
    } as never)

    expect(result).toEqual({ messageIds: [] })
  })

  test("removeReplyKeyboard does not crash and sends nothing", async () => {
    const result = await sendFlowStep({
      ctx: {} as never,
      data: {
        contact: { id: "contact-1", sourceId: "guest-1" },
        step: { id: "step-2", stepType: "removeReplyKeyboard", message: "" },
      },
    } as never)

    expect(result).toEqual({ messageIds: [] })
  })
})
