"use client"

import {
  BROADCAST_TEXT_FLOW_FOLDER_NAME,
  type ChannelType,
} from "@chatbotx.io/database/partials"
import { BUTTON_LABEL_MAX } from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"
import { RichTextEditorField } from "@/components/tiptap/rich-text-editor-field"
import { BROADCAST_TEXT_MAX_BUTTONS } from "../lib/broadcast-text-message"

/**
 * "Text" broadcast body: the same rich-text editor as the flow builder's
 * `sendText` step (writes `textMessage.text` + `textMessage.version`) plus up
 * to `BROADCAST_TEXT_MAX_BUTTONS` link buttons. The server turns it into a
 * one-node published flow on submit.
 */
export function BroadcastTextMessageEditor({
  channel,
}: {
  channel: ChannelType
}) {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "textMessage.buttons",
  })

  return (
    <div className="flex flex-col gap-4">
      <RichTextEditorField
        channels={[channel]}
        label={t("fields.message.label")}
        name="textMessage.text"
        required
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-sm">
            {t("broadcasts.textMessage.buttons")}
          </span>
          <span className="text-muted-foreground text-xs">
            {t("broadcasts.textMessage.buttonsDescription", {
              max: BROADCAST_TEXT_MAX_BUTTONS,
            })}
          </span>
        </div>

        {fields.map((field, index) => (
          <div className="flex items-start gap-2" key={field.id}>
            <InputField
              formItemClassName="w-48 shrink-0"
              label={t("fields.buttonLabel.label")}
              maxLength={BUTTON_LABEL_MAX}
              name={`textMessage.buttons.${index}.label`}
              required
            />
            <InputField
              formItemClassName="min-w-0 flex-1"
              label={t("fields.url.label")}
              name={`textMessage.buttons.${index}.url`}
              placeholder="https://"
              required
            />
            <Button
              aria-label={t("actions.remove")}
              className="mt-6 shrink-0"
              onClick={() => remove(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <TrashIcon />
            </Button>
          </div>
        ))}

        {fields.length < BROADCAST_TEXT_MAX_BUTTONS && (
          <Button
            className="self-start"
            onClick={() => append({ label: "", url: "" })}
            type="button"
            variant="outline"
          >
            <PlusIcon />
            {t("broadcasts.textMessage.addButton")}
          </Button>
        )}
      </div>

      <span className="text-muted-foreground text-xs">
        {t("broadcasts.textMessage.flowNotice", {
          folder: BROADCAST_TEXT_FLOW_FOLDER_NAME,
        })}
      </span>
    </div>
  )
}
