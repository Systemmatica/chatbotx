import type { NodeType } from "@chatbotx.io/flow-config"
import { Popover, PopoverContent } from "@chatbotx.io/ui/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Position, useNodeConnections } from "@xyflow/react"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type MouseEvent, useState } from "react"
import { BaseHandle, type BaseHandleProps } from "@/components/base-handle"
import { useFlowMutation } from "../flow-mutation-context"
import { NodeTypeMenu } from "../panel-buttons/add-node-button"

const HANDLE_CLASS =
  "flex! size-5! items-center justify-center rounded-full! border-primary! bg-background! text-primary! shadow-sm transition hover:bg-primary! hover:text-primary-foreground!"

const CONNECTED_CLASS = "bg-primary! text-primary-foreground!"

/**
 * Round "+" source handle that replaced the old "Continue" label. The handle
 * id stays the node id and the side stays Position.Right, so edges saved
 * against the previous handle keep attaching to it.
 */
function NextStepHandleBase({
  nodeId,
  className,
  ...rest
}: Omit<BaseHandleProps, "id" | "position" | "type"> & {
  nodeId: string
  ref?: React.RefObject<HTMLDivElement>
}) {
  return (
    <BaseHandle
      className={cn(HANDLE_CLASS, className)}
      id={nodeId}
      onConnectedClassName={CONNECTED_CLASS}
      position={Position.Right}
      type="source"
      {...rest}
    >
      <PlusIcon className="pointer-events-none size-3.5" strokeWidth={2.5} />
    </BaseHandle>
  )
}

/** Read-only variant for the analytics canvas. */
export function NextStepHandleView({ nodeId }: { nodeId: string }) {
  return (
    <div className="relative h-5 w-full">
      <NextStepHandleBase isConnectable={false} nodeId={nodeId} />
    </div>
  )
}

/**
 * Editor variant: drag it to connect as before; click it while unconnected to
 * pick the next node type, which is created to the right and auto-connected.
 */
export function NextStepHandle({ nodeId }: { nodeId: string }) {
  const t = useTranslations()
  const { addNextNode, isFlowMutating } = useFlowMutation()
  const connections = useNodeConnections({
    handleType: "source",
    handleId: nodeId,
  })
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const isConnected = connections.length > 0

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    // Keep the click from selecting the node and opening its editor sheet.
    event.stopPropagation()
    if (isFlowMutating) {
      return
    }
    setAnchor(event.currentTarget)
  }

  const onSelect = (nodeType: NodeType) => {
    setAnchor(null)
    addNextNode({ sourceNodeId: nodeId, sourceHandleId: nodeId, nodeType })
  }

  return (
    <div className="relative h-5 w-full">
      <Tooltip>
        <TooltipTrigger
          render={
            <NextStepHandleBase
              nodeId={nodeId}
              // Only override React Flow's click-to-connect when there is an
              // action of our own, so a connected handle keeps stock behaviour.
              {...(isConnected ? {} : { onClick })}
            />
          }
        />
        <TooltipContent>{t("flowCanvas.nextStep")}</TooltipContent>
      </Tooltip>
      <Popover
        onOpenChange={(open) => {
          if (!open) {
            setAnchor(null)
          }
        }}
        open={anchor !== null}
      >
        <PopoverContent
          align="start"
          anchor={anchor}
          className="w-max max-w-xs p-2"
          // React bubbles portal events through the component tree; without
          // this a pick would also reach the node and open its editor sheet.
          onClick={(event) => event.stopPropagation()}
          side="right"
        >
          <NodeTypeMenu onSelect={onSelect} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
