import { ControlButton } from "@xyflow/react"
import { Loader2Icon, WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export default function AutoLayoutButton({
  disabled,
  isRunning,
  onClick,
}: {
  disabled?: boolean
  isRunning?: boolean
  onClick: () => void
}) {
  const t = useTranslations()
  const label = t("flowCanvas.autoLayout")

  return (
    <ControlButton
      aria-label={label}
      className="h-9! w-14! bg-zinc-100! p-0! dark:bg-neutral-500!"
      disabled={disabled || isRunning}
      onClick={onClick}
      title={label}
    >
      {isRunning ? (
        <Loader2Icon className="max-h-full! max-w-full! animate-spin fill-none!" />
      ) : (
        <WorkflowIcon className="max-h-full! max-w-full! fill-none!" />
      )}
    </ControlButton>
  )
}
