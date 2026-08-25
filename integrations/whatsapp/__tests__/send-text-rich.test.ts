import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const baseProps = (step: Record<string, unknown>) =>
  ({
    data: {
      contact: { id: "contact-1", sourceId: "84123456789" },
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      step,
      quickReplies: [],
      metadata: {},
    },
  }) as never

describe("whatsapp send-text rich text", () => {
  test("v2 converts to WhatsApp markdown, links expanded to label (url)", () => {
    const [message] = Array.from(
      convertFlowStepText(
        baseProps({
          id: "step-1",
          stepType: "sendText",
          version: "v2",
          text:
            "<b>bold</b> <i>italic</i> <s>strike</s> <code>code</code> " +
            '<a href="https://example.com">link</a>',
          buttons: [],
        }),
      ),
    )

    expect(JSON.parse(JSON.stringify(message)).body).toBe(
      "*bold* _italic_ ~strike~ ```code``` link (https://example.com)",
    )
  })

  test("v1 (legacy) passes the raw string through unchanged", () => {
    const [message] = Array.from(
      convertFlowStepText(
        baseProps({
          id: "step-1",
          stepType: "sendText",
          text: "*not markdown* just text",
          buttons: [],
        }),
      ),
    )

    expect(JSON.parse(JSON.stringify(message)).body).toBe(
      "*not markdown* just text",
    )
  })
})
