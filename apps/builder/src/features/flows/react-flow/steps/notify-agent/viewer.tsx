"use client"

import type { NotifyAgentStepSchema } from "@chatbotx.io/flow-config"
import { BellRingIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const NotifyAgentStepViewer = ({ data }: { data?: NotifyAgentStepSchema }) => {
  const t = useTranslations()
  const text = data?.text?.trim()

  return (
    <BaseStepViewer icon={BellRingIcon} title={t("flows.actions.notifyAgent")}>
      {text ? (
        <span className="line-clamp-2 text-muted-foreground text-xs">
          {text}
        </span>
      ) : undefined}
    </BaseStepViewer>
  )
}

export default NotifyAgentStepViewer
