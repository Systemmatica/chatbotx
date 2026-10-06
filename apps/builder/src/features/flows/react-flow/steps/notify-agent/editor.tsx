"use client"

import { BellRingIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import { BaseStepEditor } from "../base/editor"

type NotifyAgentStepEditorProps = {
  parentName: string
}

const NotifyAgentStepEditor = ({ parentName }: NotifyAgentStepEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={BellRingIcon} title={t("flows.actions.notifyAgent")}>
      <PlainTextEditorField
        description={t("flows.notifyAgent.description")}
        includeRawCustomFieldVariables
        label={t("flows.notifyAgent.textLabel")}
        name={`${parentName}.text`}
        placeholder={t("flows.notifyAgent.textPlaceholder")}
        required
        showEmojiPicker
      />
    </BaseStepEditor>
  )
}

export default NotifyAgentStepEditor
