import { describe, expect, test } from "vitest"
import { mapFlowStepToEnvelope } from "../src/handlers/message/outgoing-message"

describe("api channel send-text rich text", () => {
  test("v2 renders to plain text, tags dropped, links expanded — the callback target is an unknown external system", () => {
    const result = mapFlowStepToEnvelope({
      id: "step-1",
      stepType: "sendText",
      version: "v2",
      text: '<b>Hello</b> <a href="https://example.com">world</a>',
      buttons: [],
    } as never)

    expect(result).toEqual({ text: "Hello world (https://example.com)" })
  })

  test("v1 (legacy) passes through unchanged", () => {
    const result = mapFlowStepToEnvelope({
      id: "step-1",
      stepType: "sendText",
      text: "<b>literal tags, not markup</b>",
      buttons: [],
    } as never)

    expect(result).toEqual({ text: "<b>literal tags, not markup</b>" })
  })
})
