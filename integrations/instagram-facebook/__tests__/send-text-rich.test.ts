import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const baseProps = (step: Record<string, unknown>) =>
  ({
    data: {
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      step,
    },
  }) as never

describe("instagram-facebook send-text rich text", () => {
  test("v2 renders to plain text, tags dropped, links expanded", () => {
    const [payload] = Array.from(
      convertFlowStepText(
        baseProps({
          id: "step-1",
          stepType: "sendText",
          version: "v2",
          text: '<b>Hello</b> <a href="https://example.com">world</a>',
          buttons: [],
        }),
      ),
    )

    expect(payload).toEqual({ text: "Hello world (https://example.com)" })
  })

  test("v1 (legacy) passes through unchanged", () => {
    const [payload] = Array.from(
      convertFlowStepText(
        baseProps({
          id: "step-1",
          stepType: "sendText",
          text: "<b>literal tags, not markup</b>",
          buttons: [],
        }),
      ),
    )

    expect(payload).toEqual({ text: "<b>literal tags, not markup</b>" })
  })
})
