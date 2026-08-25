import {
  richTextToWhatsappMarkdown,
  type SendTextStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { Text } from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../../../schema"
import { buildWhatsappButtonMessages } from "./shared"

export function* convertFlowStepText(
  props: Parameters<
    MessageHandlers<WhatsappAuthValue, SendTextStepSchema>["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props
  // Legacy/plain ("v1"/absent) steps pass through unchanged; "v2" steps are
  // converted to WhatsApp's own markdown (*bold*, _italic_, ~strike~,
  // `code`, links expanded to "label (url)" since WhatsApp has no link
  // syntax).
  const text = richTextToWhatsappMarkdown(step.text, step.version)
  const buttonCount =
    step.buttons.length + (props.data.quickReplies?.length ?? 0)
  if (buttonCount === 0) {
    yield new Text(text)
    return
  }

  for (const message of buildWhatsappButtonMessages({
    flowId: props.data.flowId,
    flowVersionId: props.data.flowVersionId,
    buttons: step.buttons,
    quickReplies: props.data.quickReplies,
    metadata: props.data.metadata,
    bodyText: text,
  })) {
    yield message
  }
}
