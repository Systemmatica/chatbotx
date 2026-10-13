"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DropdownMenuItem } from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { StarIcon, StarOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { usePinnedFlows } from "../hooks/use-pinned-flows"

type PinFlowProps = {
  workspaceId: string
  flowId: string
  /** Shown in the sidebar link; the server re-reads the current name on refresh. */
  flowName: string
}

/** Star toggle for the flow hub header. */
export function PinFlowButton({ workspaceId, flowId, flowName }: PinFlowProps) {
  const t = useTranslations()
  const { isPinned, setPinned } = usePinnedFlows(workspaceId)
  const pinned = isPinned(flowId)
  const label = t(pinned ? "pinnedFlows.unpin" : "pinnedFlows.pin")

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={pinned}
            className="size-8 shrink-0"
            onClick={() => {
              setPinned({ id: flowId, name: flowName }, !pinned).catch(
                () => undefined,
              )
            }}
            size="icon"
            variant="ghost"
          >
            <StarIcon
              className={cn(
                "size-4",
                pinned && "fill-amber-400 text-amber-500",
              )}
            />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** "Pin to sidebar" / "Unpin" entry of a flows list row menu. */
export function PinFlowMenuItem({
  workspaceId,
  flowId,
  flowName,
}: PinFlowProps) {
  const t = useTranslations()
  const { isPinned, setPinned } = usePinnedFlows(workspaceId)
  const pinned = isPinned(flowId)

  return (
    <DropdownMenuItem
      onClick={() => {
        setPinned({ id: flowId, name: flowName }, !pinned).catch(
          () => undefined,
        )
      }}
    >
      {pinned ? <StarOffIcon /> : <StarIcon />}
      {t(pinned ? "pinnedFlows.unpin" : "pinnedFlows.pin")}
    </DropdownMenuItem>
  )
}
