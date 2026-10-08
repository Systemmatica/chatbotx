import { describe, expect, test } from "vitest"
import { createBroadcastRequest } from "@/features/broadcasts/schemas/action"

const baseRequest = {
  channel: "telegram",
  subaction: "telegramAllContacts",
  schedulesType: "now",
  schedulesAt: null,
  contactFilter: { operator: "and", conditions: [] },
  contentType: "text",
}

const issuePaths = (
  result: ReturnType<typeof createBroadcastRequest.safeParse>,
) =>
  result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))

describe("createBroadcastRequest — text broadcast", () => {
  test("accepts a text broadcast without a flow", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      textMessage: {
        text: "<b>Ребята, привет!</b> Вы остановились на этом шаге",
        version: "v2",
        buttons: [{ label: "Продолжить", url: "https://example.com" }],
      },
    })

    expect(result.success).toBe(true)
  })

  test("requires text in text mode", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      textMessage: { text: "", version: "v2", buttons: [] },
    })

    expect(issuePaths(result)).toContain("textMessage.text")
  })

  test("rejects text over the sendText visible-length limit", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      textMessage: {
        text: `<b>${"a".repeat(1001)}</b>`,
        version: "v2",
        buttons: [],
      },
    })

    expect(issuePaths(result)).toContain("textMessage.text")
  })

  test("counts visible characters, not markup", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      textMessage: {
        text: `<b>${"a".repeat(1000)}</b>`,
        version: "v2",
        buttons: [],
      },
    })

    expect(result.success).toBe(true)
  })

  test("rejects a button label over 20 characters and an invalid url", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      textMessage: {
        text: "Hi",
        version: "v2",
        buttons: [{ label: "x".repeat(21), url: "not a url" }],
      },
    })

    expect(issuePaths(result)).toEqual(
      expect.arrayContaining([
        "textMessage.buttons.0.label",
        "textMessage.buttons.0.url",
      ]),
    )
  })

  test("rejects more than 3 buttons", () => {
    const button = { label: "Go", url: "https://example.com" }
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      textMessage: {
        text: "Hi",
        version: "v2",
        buttons: [button, button, button, button],
      },
    })

    expect(result.success).toBe(false)
  })

  test("rejects text mode for template subactions", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      channel: "whatsapp",
      subaction: "whatsappTemplateMessage",
      textMessage: { text: "Hi", version: "v2", buttons: [] },
    })

    expect(issuePaths(result)).toContain("contentType")
  })

  test("ignores an invalid text draft in flow mode", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      contentType: "flow",
      flowId: "11612473309626368",
      textMessage: { text: "", version: "v2", buttons: [] },
    })

    expect(result.success).toBe(true)
  })

  test("still requires a flow in flow mode", () => {
    const result = createBroadcastRequest.safeParse({
      ...baseRequest,
      contentType: "flow",
    })

    expect(issuePaths(result)).toContain("flowId")
  })
})
