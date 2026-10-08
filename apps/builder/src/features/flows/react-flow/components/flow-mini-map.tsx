"use client"

import { MiniMap } from "@xyflow/react"
import { useTranslations } from "next-intl"

/**
 * Overview of the whole canvas with a frame for the visible area: click or
 * drag in it to move the canvas, scroll to zoom.
 */
export function FlowMiniMap() {
  const t = useTranslations()

  return (
    <MiniMap
      ariaLabel={t("flowHub.miniMap")}
      className="overflow-hidden rounded-md border bg-background!"
      maskColor="color-mix(in oklab, var(--muted) 70%, transparent)"
      nodeBorderRadius={6}
      nodeColor="var(--muted-foreground)"
      nodeStrokeWidth={0}
      pannable
      position="bottom-right"
      zoomable
    />
  )
}
