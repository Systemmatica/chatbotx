"use client"

import type { NodeType } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ControlButton, type Edge, type Node, Panel } from "@xyflow/react"
import { CircleDashedIcon, ListTreeIcon, PlayIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type KeyboardEvent, memo, useMemo, useState } from "react"
import { allNodesConfig } from "../nodes/node-config"
import {
  buildFlowOutline,
  type FlowOutlineItem,
  filterFlowOutline,
  type OutlineSourceNode,
} from "./flow-outline"

export function FlowOutlineToggleButton({
  open,
  onClick,
}: {
  open: boolean
  onClick: () => void
}) {
  const t = useTranslations()
  const label = t(open ? "flowCanvas.outline.hide" : "flowCanvas.outline.show")

  return (
    <ControlButton
      aria-label={label}
      aria-pressed={open}
      className={cn(
        "h-9! w-14! bg-zinc-100! p-0! dark:bg-neutral-500!",
        open && "bg-zinc-300! dark:bg-neutral-400!",
      )}
      onClick={onClick}
      title={label}
    >
      <ListTreeIcon className="max-h-full! max-w-full! fill-none!" />
    </ControlButton>
  )
}

const OutlineItemIcon = memo(({ type }: { type: string }) => {
  const t = useTranslations()
  const Icon = allNodesConfig[type as NodeType]?.(t).icon
  return Icon ? (
    <Icon className="size-4 shrink-0 text-muted-foreground" />
  ) : (
    <span className="size-4 shrink-0" />
  )
})

type FlowOutlinePanelProps = {
  nodes: Node[]
  edges: Edge[]
  onClose: () => void
  onSelect: (nodeId: string) => void
}

/** Collapsible list of every block, in conversation order, with search. */
export function FlowOutlinePanel({
  nodes,
  edges,
  onClose,
  onSelect,
}: FlowOutlinePanelProps) {
  const t = useTranslations()
  const [query, setQuery] = useState("")

  const outline = useMemo(
    () =>
      buildFlowOutline(
        nodes as unknown as OutlineSourceNode[],
        edges as { source: string; target: string; sourceHandle?: string }[],
      ),
    [nodes, edges],
  )
  const visible = useMemo(
    () => filterFlowOutline(outline, query),
    [outline, query],
  )
  const selectedId = nodes.find((node) => node.selected)?.id ?? null
  const firstUnreachableIndex = visible.findIndex((item) => !item.reachable)

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && visible[0]) {
      event.preventDefault()
      onSelect(visible[0].id)
    }
    if (event.key === "Escape" && query) {
      event.preventDefault()
      setQuery("")
    }
  }

  return (
    <Panel
      aria-label={t("flowCanvas.outline.title")}
      className="flex max-h-[calc(100%-8rem)] w-64 flex-col overflow-hidden rounded-lg border bg-background shadow-md"
      position="top-left"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="font-medium text-sm">
          {t("flowCanvas.outline.title")}
        </span>
        <Button
          aria-label={t("flowCanvas.outline.hide")}
          className="size-7"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="border-b p-2">
        <Input
          aria-label={t("flowCanvas.outline.search")}
          className="h-8"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={t("flowCanvas.outline.search")}
          type="search"
          value={query}
        />
      </div>
      <ul className="nowheel min-h-0 flex-1 overflow-y-auto p-1">
        {visible.length === 0 && (
          <li className="px-2 py-3 text-center text-muted-foreground text-sm">
            {t("flowCanvas.outline.empty")}
          </li>
        )}
        {visible.map((item, index) => (
          <OutlineRow
            isSelected={item.id === selectedId}
            item={item}
            key={item.id}
            onSelect={onSelect}
            showUnreachableHeading={index === firstUnreachableIndex}
          />
        ))}
      </ul>
    </Panel>
  )
}

function OutlineRow({
  item,
  isSelected,
  showUnreachableHeading,
  onSelect,
}: {
  item: FlowOutlineItem
  isSelected: boolean
  showUnreachableHeading: boolean
  onSelect: (nodeId: string) => void
}) {
  const t = useTranslations()

  return (
    <li>
      {showUnreachableHeading && (
        <div className="flex items-center gap-1.5 px-2 pt-3 pb-1 text-muted-foreground text-xs">
          <CircleDashedIcon className="size-3.5" />
          {t("flowCanvas.outline.unreachable")}
        </div>
      )}
      <button
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isSelected && "bg-accent font-medium",
          !item.reachable && "text-muted-foreground",
        )}
        onClick={() => onSelect(item.id)}
        title={
          item.reachable ? item.name : t("flowCanvas.outline.unreachableHint")
        }
        type="button"
      >
        <OutlineItemIcon type={item.type} />
        <span className="min-w-0 flex-1 truncate">
          {item.name || t("flowCanvas.outline.unnamed")}
        </span>
        {item.isStartNode && (
          <PlayIcon
            aria-label={t("flowCanvas.outline.start")}
            className="size-3.5 shrink-0 text-destructive"
          />
        )}
      </button>
    </li>
  )
}
