import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@chatbotx.io/ui/components/ui/context-menu"
import type { XYPosition } from "@xyflow/react"
import { CopyIcon, FilterIcon, SquarePlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useCallback, useRef, useState } from "react"

/** What the user right-clicked. `null` means something without a menu. */
type FlowContextMenuTarget =
  | { kind: "pane"; position: XYPosition }
  | { kind: "node"; nodeId: string; canDelete: boolean }
  | null

type FlowContextMenuActions = {
  disabled: boolean
  onCreateBlock: (position: XYPosition) => void
  onCreateCondition: (position: XYPosition) => void
  onDuplicateNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}

/**
 * Right-click menu for the flow canvas.
 *
 * React Flow reports *what* was clicked (pane or node) through its own
 * `onPaneContextMenu`/`onNodeContextMenu` callbacks; those run before the
 * trigger's bubbling `contextmenu` handler, so `setTarget` is always called
 * before the menu asks to open. The capture handler clears the previous target
 * first, so right-clicking an edge or a panel opens nothing.
 */
export function useFlowContextMenu() {
  const targetRef = useRef<FlowContextMenuTarget>(null)
  const [target, setTargetState] = useState<FlowContextMenuTarget>(null)

  const setTarget = useCallback((next: FlowContextMenuTarget) => {
    targetRef.current = next
    setTargetState(next)
  }, [])

  return { targetRef, target, setTarget }
}

export function FlowContextMenu({
  actions,
  children,
  menu,
}: {
  actions: FlowContextMenuActions
  children: ReactNode
  menu: ReturnType<typeof useFlowContextMenu>
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { target, targetRef, setTarget } = menu

  const onOpenChange = (next: boolean) => {
    setOpen(next && targetRef.current !== null && !actions.disabled)
  }

  return (
    <ContextMenu onOpenChange={onOpenChange} open={open}>
      <ContextMenuTrigger
        // Sits where ReactFlow used to: fill the flex column under the header.
        className="h-full min-h-0 w-full flex-1"
        onContextMenuCapture={() => setTarget(null)}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        {target?.kind === "pane" && (
          <>
            <ContextMenuItem
              onClick={() => actions.onCreateBlock(target.position)}
            >
              <SquarePlusIcon />
              {t("flowCanvas.createBlock")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => actions.onCreateCondition(target.position)}
            >
              <FilterIcon />
              {t("flowCanvas.createCondition")}
            </ContextMenuItem>
          </>
        )}
        {target?.kind === "node" && (
          <>
            <ContextMenuItem
              onClick={() => actions.onDuplicateNode(target.nodeId)}
            >
              <CopyIcon />
              {t("actions.duplicate")}
            </ContextMenuItem>
            {target.canDelete && (
              <ContextMenuItem
                onClick={() => actions.onDeleteNode(target.nodeId)}
                variant="destructive"
              >
                <TrashIcon />
                {t("actions.delete")}
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
