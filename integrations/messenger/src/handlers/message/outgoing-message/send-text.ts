import {
  richTextToPlainText,
  type SendTextStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type {
  FacebookMessage,
  FacebookMessageAttachment,
  MessengerAuthValue,
} from "../../../schema"
import { convertFacebookButtons } from "./send-button"
import { convertCanonicalFacebookQuickReplies } from "./send-quick-replies"

export function* convertFlowStepText(
  props: SendFlowStepProps<MessengerAuthValue, SendTextStepSchema>,
): Generator<FacebookMessageAttachment | FacebookMessage> {
  const {
    data: { step },
  } = props
  const quickReplies = props.data.quickReplies ?? []
  // Messenger has no formatting support — "v2" rich markup renders to plain
  // text (tags dropped, links expanded to "label (url)"); "v1"/absent
  // passes through unchanged.
  const text = richTextToPlainText(step.text, step.version)

  if (step.buttons.length === 0) {
    if (quickReplies.length > 0) {
      yield {
        text,
        quick_replies: convertCanonicalFacebookQuickReplies(quickReplies),
      }
      return
    }
    yield {
      text,
    }
  } else {
    const buttons = convertFacebookButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: step.buttons,
      metadata: props.data.metadata,
      contactInboxId: props.data.contact.id,
    })

    yield {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text,
          buttons,
        },
      },
      ...(quickReplies.length > 0
        ? { quick_replies: convertCanonicalFacebookQuickReplies(quickReplies) }
        : {}),
    }
  }
}
