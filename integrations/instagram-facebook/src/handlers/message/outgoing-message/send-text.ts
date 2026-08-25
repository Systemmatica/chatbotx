import {
  richTextToPlainText,
  type SendTextStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type {
  InstagramAuthValue,
  InstagramMessageAttachment,
  InstagramSendMessage,
} from "../../../schemas"
import { convertInstagramButtons } from "./send-button"

export function* convertFlowStepText(
  props: SendFlowStepProps<InstagramAuthValue, SendTextStepSchema>,
): Generator<InstagramMessageAttachment | InstagramSendMessage> {
  const {
    data: { step },
  } = props
  // Instagram has no formatting support — "v2" rich markup renders to plain
  // text (tags dropped, links expanded to "label (url)"); "v1"/absent
  // passes through unchanged.
  const text = richTextToPlainText(step.text, step.version)
  if (step.buttons.length === 0) {
    yield {
      text,
    }
  } else {
    const buttons = convertInstagramButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: step.buttons,
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
    }
  }
}
