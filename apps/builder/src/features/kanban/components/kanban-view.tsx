"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SquareKanbanIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { client } from "@/lib/orpc/orpc"
import { appendColumnCards, moveCardBetweenColumns } from "../lib/columns"
import type {
  KanbanBoardResource,
  KanbanCardResource,
  KanbanColumnResource,
} from "../schemas/resource"
import { KanbanBoardDialog } from "./kanban-board-dialog"
import { KanbanCard } from "./kanban-card"
import { KanbanColumn } from "./kanban-column"

const CARDS_PER_COLUMN = 50
const ALL_TAGS = ""

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

type KanbanViewProps = {
  workspaceId: string
  canManageBoards: boolean
}

export function KanbanView({ workspaceId, canManageBoards }: KanbanViewProps) {
  const t = useTranslations()
  const tagOptions = useTagSelectOptions()

  const [boards, setBoards] = useState<KanbanBoardResource[]>([])
  const [boardsLoaded, setBoardsLoaded] = useState(false)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [columns, setColumns] = useState<KanbanColumnResource[]>([])
  const [isLoadingCards, setIsLoadingCards] = useState(false)
  const [loadingMoreColumnId, setLoadingMoreColumnId] = useState<string | null>(
    null,
  )
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [tagId, setTagId] = useState(ALL_TAGS)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBoard, setEditingBoard] = useState<KanbanBoardResource | null>(
    null,
  )
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [activeCard, setActiveCard] = useState<KanbanCardResource | null>(null)
  const requestIdRef = useRef(0)

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  )

  const applySearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim())
  }, 300)

  const loadBoards = useCallback(async () => {
    try {
      const { data } = await client.kanbanAPI.listKanbanBoardsAPI({
        workspaceId,
      })
      setBoards(data)
      setSelectedBoardId((current) =>
        current && data.some((board) => board.id === current)
          ? current
          : (data[0]?.id ?? null),
      )
    } catch (error) {
      toast.error(errorMessage(error, t("messages.errorLoadingData")))
    } finally {
      setBoardsLoaded(true)
    }
  }, [workspaceId, t])

  const loadCards = useCallback(async () => {
    if (!selectedBoardId) {
      setColumns([])
      return
    }
    const requestId = ++requestIdRef.current
    setIsLoadingCards(true)
    try {
      const result = await client.kanbanAPI.getKanbanBoardCardsAPI({
        workspaceId,
        boardId: selectedBoardId,
        search: search || undefined,
        tagId: tagId || undefined,
        perColumn: CARDS_PER_COLUMN,
      })
      if (requestId === requestIdRef.current) {
        setColumns(result.columns)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        toast.error(errorMessage(error, t("messages.errorLoadingData")))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoadingCards(false)
      }
    }
  }, [workspaceId, selectedBoardId, search, tagId, t])

  useEffect(() => {
    loadBoards()
  }, [loadBoards])

  useEffect(() => {
    loadCards()
  }, [loadCards])

  const handleLoadMore = async (columnId: string) => {
    const column = columns.find((item) => item.id === columnId)
    if (!(selectedBoardId && column)) {
      return
    }
    setLoadingMoreColumnId(columnId)
    try {
      const result = await client.kanbanAPI.getKanbanBoardCardsAPI({
        workspaceId,
        boardId: selectedBoardId,
        search: search || undefined,
        tagId: tagId || undefined,
        perColumn: CARDS_PER_COLUMN,
        stageId: columnId,
        offset: column.cards.length,
      })
      const page = result.columns[0]
      if (page) {
        setColumns((current) => appendColumnCards(current, page))
      }
    } catch (error) {
      toast.error(errorMessage(error, t("messages.errorLoadingData")))
    } finally {
      setLoadingMoreColumnId(null)
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor),
  )

  const handleDragStart = ({ active }: DragStartEvent) => {
    const card = columns
      .flatMap((column) => column.cards)
      .find((item) => item.contactId === String(active.id))
    setActiveCard(card ?? null)
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveCard(null)
    if (!(over && selectedBoardId)) {
      return
    }
    const contactId = String(active.id)
    const targetColumnId = String(over.id)
    const previous = columns
    const next = moveCardBetweenColumns(previous, contactId, targetColumnId)
    if (next === previous) {
      return
    }

    setColumns(next)
    try {
      await client.kanbanAPI.moveKanbanCardAPI({
        workspaceId,
        boardId: selectedBoardId,
        contactId,
        stageId: targetColumnId,
      })
    } catch (error) {
      // Roll back only this card so moves made meanwhile are kept.
      setColumns((current) => {
        const origin = previous.find((column) =>
          column.cards.some((card) => card.contactId === contactId),
        )
        return origin
          ? moveCardBetweenColumns(current, contactId, origin.id)
          : previous
      })
      toast.error(`${t("kanban.moveFailed")} ${errorMessage(error, "")}`.trim())
    }
  }

  const handleSaved = (board: KanbanBoardResource) => {
    setBoards((current) =>
      current.some((item) => item.id === board.id)
        ? current.map((item) => (item.id === board.id ? board : item))
        : [...current, board],
    )
    setSelectedBoardId(board.id)
    if (board.id === selectedBoardId) {
      loadCards()
    }
  }

  const handleDelete = async () => {
    if (!selectedBoard) {
      return
    }
    try {
      await client.kanbanAPI.deleteKanbanBoardAPI({
        workspaceId,
        boardId: selectedBoard.id,
      })
      toast.success(
        t("messages.deletedSuccess", { feature: selectedBoard.name }),
      )
      const remaining = boards.filter((board) => board.id !== selectedBoard.id)
      setBoards(remaining)
      setSelectedBoardId(remaining[0]?.id ?? null)
    } catch (error) {
      toast.error(errorMessage(error, t("messages.deleteFailed")))
    } finally {
      setDeleteOpen(false)
    }
  }

  const openCreateDialog = () => {
    setEditingBoard(null)
    setDialogOpen(true)
  }

  const boardOptions = useMemo(
    () => boards.map((board) => ({ label: board.name, value: board.id })),
    [boards],
  )
  const tagSelectItems = useMemo(
    () => [{ label: t("kanban.allTags"), value: ALL_TAGS }, ...tagOptions],
    [tagOptions, t],
  )

  if (!boardsLoaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="font-bold text-xl">{t("kanban.title")}</h4>
          {boards.length > 1 ? (
            <Select
              items={boardOptions}
              onValueChange={(value) => setSelectedBoardId(String(value))}
              value={selectedBoardId ?? ""}
            >
              <SelectTrigger aria-label={t("kanban.board")} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {boardOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            selectedBoard && (
              <span className="truncate text-muted-foreground">
                {selectedBoard.name}
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedBoard ? (
            <Button
              aria-label={t("kanban.refresh")}
              disabled={isLoadingCards}
              onClick={() => loadCards()}
              size="icon"
              type="button"
              variant="outline"
            >
              <RefreshCwIcon className={isLoadingCards ? "animate-spin" : ""} />
            </Button>
          ) : null}
          {selectedBoard && canManageBoards ? (
            <>
              <Button
                aria-label={t("kanban.editBoard")}
                onClick={() => {
                  setEditingBoard(selectedBoard)
                  setDialogOpen(true)
                }}
                size="icon"
                type="button"
                variant="outline"
              >
                <PencilIcon />
              </Button>
              <Button
                aria-label={t("actions.delete")}
                onClick={() => setDeleteOpen(true)}
                size="icon"
                type="button"
                variant="outline"
              >
                <Trash2Icon />
              </Button>
            </>
          ) : null}
          {canManageBoards ? (
            <Button onClick={openCreateDialog} type="button">
              <PlusIcon />
              {t("kanban.newBoard")}
            </Button>
          ) : null}
        </div>
      </div>

      {selectedBoard ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("fields.search.placeholder")}
                className="ps-8"
                onChange={(event) => {
                  setSearchInput(event.target.value)
                  applySearch(event.target.value)
                }}
                placeholder={t("fields.name.searchPlaceholder")}
                value={searchInput}
              />
            </div>
            <Select
              items={tagSelectItems}
              onValueChange={(value) => setTagId(String(value ?? ALL_TAGS))}
              value={tagId}
            >
              <SelectTrigger
                aria-label={t("fields.tag.label")}
                className="w-48"
              >
                <SelectValue placeholder={t("kanban.allTags")} />
              </SelectTrigger>
              <SelectContent>
                {tagSelectItems.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingCards ? (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <DndContext
            onDragCancel={() => setActiveCard(null)}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            sensors={sensors}
          >
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
              {columns.map((column) => (
                <KanbanColumn
                  column={column}
                  key={column.id}
                  loadingMore={loadingMoreColumnId === column.id}
                  onLoadMore={handleLoadMore}
                  workspaceId={workspaceId}
                />
              ))}
            </div>
            <DragOverlay>
              {activeCard ? (
                <KanbanCard
                  card={activeCard}
                  overlay
                  workspaceId={workspaceId}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <SquareKanbanIcon className="size-10 text-muted-foreground" />
          <h5 className="font-semibold">{t("kanban.emptyTitle")}</h5>
          <p className="max-w-md text-muted-foreground text-sm">
            {t("kanban.emptyDescription")}
          </p>
          {canManageBoards ? (
            <Button onClick={openCreateDialog} type="button">
              <PlusIcon />
              {t("kanban.newBoard")}
            </Button>
          ) : null}
        </div>
      )}

      <KanbanBoardDialog
        board={editingBoard}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        open={dialogOpen}
        workspaceId={workspaceId}
      />

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("messages.deleteFeature", {
                feature: selectedBoard?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("kanban.deleteBoardDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
