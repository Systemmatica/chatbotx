import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const baseProps = (step: Record<string, unknown>) =>
  ({
    data: {
      contact: { sourceId: "chat-1" },
      flowId: "flow-1",
      step,
      quickReplies: [],
    },
  }) as never

describe("telegram send-text rich text", () => {
  test("v2 sends HTML with parse_mode: HTML", () => {
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

    expect(payload).toEqual({
      chat_id: "chat-1",
      text: '<b>Hello</b> <a href="https://example.com">world</a>',
      parse_mode: "HTML",
    })
  })

  test("v2 escapes < & > inside text nodes so they can't break parse_mode HTML", () => {
    const [payload] = Array.from(
      convertFlowStepText(
        baseProps({
          id: "step-1",
          stepType: "sendText",
          version: "v2",
          text: "5 < 10 & true",
          buttons: [],
        }),
      ),
    )

    // Not valid rich-text markup (bare "<"/"&"), so the safe fallback
    // escapes it as plain text rather than passing raw "<"/"&" to Telegram
    // under parse_mode: HTML.
    expect(payload.text).toBe("5 &lt; 10 &amp; true")
    expect(payload.parse_mode).toBe("HTML")
  })

  test("v1 (legacy) sends the raw string with no parse_mode, exactly as before", () => {
    const [payload] = Array.from(
      convertFlowStepText(
        baseProps({
          id: "step-1",
          stepType: "sendText",
          text: "5 < 10 & raw <b>not html</b>",
          buttons: [],
        }),
      ),
    )

    expect(payload).toEqual({
      chat_id: "chat-1",
      text: "5 < 10 & raw <b>not html</b>",
      parse_mode: undefined,
    })
  })

  test("v2 with buttons still sets parse_mode on the keyboard payload", () => {
    const [payload] = Array.from(
      convertFlowStepText(
        baseProps({
          id: "step-1",
          stepType: "sendText",
          version: "v2",
          text: "<i>Choose</i>",
          buttons: [
            {
              id: "btn-1",
              label: "Yes",
              buttonType: null,
              beforeStep: null,
              steps: [],
            },
          ],
        }),
      ),
    )

    expect(payload.text).toBe("<i>Choose</i>")
    expect(payload.parse_mode).toBe("HTML")
    expect(payload.reply_markup?.inline_keyboard.flat()).toEqual([
      expect.objectContaining({ text: "Yes" }),
    ])
  })
})
