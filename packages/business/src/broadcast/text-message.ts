import {
  chooseChannelStepDefaultFn,
  openWebsiteStepDefaultFn,
  richTextToPlainText,
  type SendMessageNodeSchema,
  type SendTextStepVersionSchema,
  sendTextStepDefaultFn,
  sendTextStepVersions,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"

const BROADCAST_TEXT_NAME_MAX = 60
const WHITESPACE_RUN_REGEX = /\s+/g

export type BroadcastTextMessage = {
  /** Rich text markup (`sendText` `v2`) or legacy plain text. */
  text: string
  version?: SendTextStepVersionSchema
  buttons?: { label: string; url: string }[]
}

/**
 * Builds the single start node of a "Text" broadcast's service flow: one
 * `sendText` step, with each link button as an `openWebsite` button — the
 * same shape the flow builder produces, so the broadcast worker runs it like
 * any other published flow.
 */
export function buildBroadcastTextFlowNode(
  message: BroadcastTextMessage,
): SendMessageNodeSchema {
  return {
    id: createId(),
    position: { x: 100, y: 300 },
    measured: { width: 288, height: 100 },
    type: "sendMessage",
    data: {
      name: "Start",
      isStartNode: true,
      details: {
        beforeStep: chooseChannelStepDefaultFn(),
        steps: [
          {
            ...sendTextStepDefaultFn({
              text: message.text,
              version: message.version ?? sendTextStepVersions.enum.v2,
            }),
            buttons: (message.buttons ?? []).map((button) => ({
              id: createId(),
              label: button.label,
              buttonType: "openWebsite" as const,
              beforeStep: {
                ...openWebsiteStepDefaultFn(),
                url: button.url,
              },
              steps: [],
            })),
          },
        ],
        quickReplies: [],
      },
    },
  }
}

/**
 * Human-readable name for the broadcast and its service flow: the visible
 * text collapsed to one line and truncated.
 */
export function buildBroadcastTextName(message: BroadcastTextMessage): string {
  const plain = richTextToPlainText(
    message.text,
    message.version ?? sendTextStepVersions.enum.v2,
  )
    .replace(WHITESPACE_RUN_REGEX, " ")
    .trim()
  if (!plain) {
    return "Broadcast"
  }
  const chars = Array.from(plain)
  return chars.length > BROADCAST_TEXT_NAME_MAX
    ? `${chars.slice(0, BROADCAST_TEXT_NAME_MAX - 1).join("")}…`
    : plain
}
