"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useDroppable } from "@dnd-kit/core"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { KanbanColumnResource } from "../schemas/resource"
import { KanbanCard } from "./kanban-card"

type KanbanColumnProps = {
  workspaceId: string
  column: KanbanColumnResource
  loadingMore: boolean
  onLoadMore: (columnId: string) => void
}

export function KanbanColumn({
  workspaceId,
  column,
  loadingMore,
  onLoadMore,
}: KanbanColumnProps) {
  const t = useTranslations()
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const title = column.isNoStatus ? t("kanban.noStatus") : column.name
  const hasMore = column.cards.length < column.total

  return (
    <section
      aria-label={title ?? undefined}
      className={cn(
        "flex max-h-full w-72 shrink-0 flex-col rounded-lg border bg-muted/40 transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
      ref={setNodeRef}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: column.color ?? "var(--muted-foreground)",
          }}
        />
        <h3
          className={cn(
            "min-w-0 flex-1 truncate font-medium text-sm",
            column.isNoStatus && "text-muted-foreground",
          )}
        >
          {title}
        </h3>
        <Badge variant="secondary">{column.total}</Badge>
      </header>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {column.cards.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-xs">
            {t("kanban.emptyColumn")}
          </p>
        ) : (
          column.cards.map((card) => (
            <KanbanCard
              card={card}
              key={card.contactId}
              workspaceId={workspaceId}
            />
          ))
        )}
        {hasMore ? (
          <Button
            className="w-full"
            disabled={loadingMore}
            onClick={() => onLoadMore(column.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {loadingMore ? <Loader2Icon className="animate-spin" /> : null}
            {t("kanban.loadMore")}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
