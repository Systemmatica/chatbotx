"use client"

import {
  escapeHtmlText,
  richTextToTelegramHtml,
  type SendTextStepSchema,
} from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useMemo } from "react"
import { replaceCouponVariableTokensWithLabels } from "@/components/tiptap/extensions/variable-injection/mention"
import { useCouponTopicOptions } from "@/features/coupons/provider/use-coupon-topic-options"
import { ButtonGroupViewer } from "../button/viewer"

type SendTextStepViewerProps = {
  data: SendTextStepSchema
}

const SendTextStepViewer = (props: SendTextStepViewerProps) => {
  const { data } = props
  const { labelById } = useCouponTopicOptions()
  const previewHtml = useMemo(() => {
    const text = replaceCouponVariableTokensWithLabels(data.text, labelById)
    // "v2" renders through the same tag set Telegram's parse_mode: HTML
    // uses (b/i/s/code/a) — it's the same small subset the toolbar can
    // produce, so it's the natural canvas preview too, and every text node
    // is escaped by the renderer itself. "v1"/absent is legacy raw text,
    // never HTML, so it's escaped here directly rather than risking a
    // literal "<"/"&" being interpreted as markup in the preview.
    return data.version === "v2"
      ? richTextToTelegramHtml(text, data.version)
      : escapeHtmlText(text)
  }, [data.text, data.version, labelById])

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <p
          className="whitespace-pre-line bg-gray-200 px-4 py-2 dark:bg-neutral-600"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: previewHtml is always either escapeHtmlText output or richTextToTelegramHtml output, which only ever emits the closed b/i/s/code/a subset with escaped text nodes.
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
        {data.buttons.length > 0 && <ButtonGroupViewer data={data.buttons} />}
      </CardContent>
    </Card>
  )
}

export default SendTextStepViewer
