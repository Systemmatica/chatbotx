"use client"

import { resolveKanbanCardProperties } from "@chatbotx.io/database/partials"
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
import { cn } from "@chatbotx.io/ui/lib/utils"
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
import { ContactPeek } from "@/features/contacts/components/contact-peek"
import { useContactPeek } from "@/features/contacts/hooks/use-contact-peek"
import { uniqueInOrder } from "@/features/contacts/lib/peek-navigation"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { flowChatsHref } from "@/features/flows/components/flow-hub-tabs"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { client } from "@/lib/orpc/orpc"
import {
  isAbortError,
  RequestTimeoutError,
  withTimeout,
} from "@/lib/with-timeout"
import { appendColumnCards, moveCardBetweenColumns } from "../lib/columns"
import type { KanbanTemplateId } from "../lib/templates"
import type {
  KanbanBoardResource,
  KanbanCardResource,
  KanbanColumnResource,
} from "../schemas/resource"
import { KanbanBoardDialog } from "./kanban-board-dialog"
import { KanbanCard, type KanbanCardDisplay } from "./kanban-card"
import { KanbanColumn } from "./kanban-column"

const CARDS_PER_COLUMN = 50
/** A click this soon after a drop is the tail of the drag, not an "open". */
const CLICK_AFTER_DRAG_MS = 250
const ALL_TAGS = ""
/**
 * A board request that has not answered by then is given up on: the view
 * shows an error with a retry button instead of spinning forever.
 */
const REQUEST_TIMEOUT_MS = 30_000

type BoardsStatus = "loading" | "ready" | "failed" | "timedOut"

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

type KanbanViewProps = {
  workspaceId: string
  canManageBoards: boolean
  /** Show only this flow's boards; new boards become its funnel. */
  flowId?: string
  /** Preset proposed when creating a board. */
  defaultTemplate?: KanbanTemplateId
  /** Hide the page title (the flow page has its own header). */
  hideTitle?: boolean
  className?: string
}

export function KanbanView({
  workspaceId,
  canManageBoards,
  flowId,
  defaultTemplate,
  hideTitle = false,
  className,
}: KanbanViewProps) {
  const t = useTranslations()
  const tagOptions = useTagSelectOptions()

  const [boards, setBoards] = useState<KanbanBoardResource[]>([])
  const [boardsStatus, setBoardsStatus] = useState<BoardsStatus>("loading")
  const [boardsReloadKey, setBoardsReloadKey] = useState(0)
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
  const lastDragEndAtRef = useRef(0)
  const { contactId: peekContactId, openContact } = useContactPeek()

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  )
  const customFields = useCustomFieldStore((state) => state.customFields)
  const cardDisplay = useMemo<KanbanCardDisplay>(
    () => ({
      properties: resolveKanbanCardProperties(selectedBoard?.cardProperties),
      customFieldsById: new Map(
        customFields.map((field) => [
          field.id,
          { id: field.id, name: field.name, type: field.type },
        ]),
      ),
    }),
    [selectedBoard?.cardProperties, customFields],
  )

  const applySearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim())
  }, 300)

  // biome-ignore lint/correctness/useExhaustiveDependencies: boardsReloadKey re-runs the request on "Retry"
  useEffect(() => {
    const controller = new AbortController()
    setBoardsStatus("loading")
    withTimeout(
      (signal) =>
        client.kanbanAPI.listKanbanBoardsAPI(
          { workspaceId, flowId: flowId ?? null },
          { signal },
        ),
      { timeoutMs: REQUEST_TIMEOUT_MS, signal: controller.signal },
    )
      .then(({ data }) => {
        setBoards(data)
        setSelectedBoardId((current) =>
          current && data.some((board) => board.id === current)
            ? current
            : (data[0]?.id ?? null),
        )
        setBoardsStatus("ready")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          // Unmounted or superseded: the next run owns the state.
          return
        }
        setBoardsStatus(
          error instanceof RequestTimeoutError ? "timedOut" : "failed",
        )
      })
    return () => controller.abort()
  }, [workspaceId, flowId, boardsReloadKey])

  const loadCards = useCallback(async () => {
    if (!selectedBoardId) {
      setColumns([])
      return
    }
    const requestId = ++requestIdRef.current
    setIsLoadingCards(true)
    try {
      const result = await withTimeout(
        (signal) =>
          client.kanbanAPI.getKanbanBoardCardsAPI(
            {
              workspaceId,
              boardId: selectedBoardId,
              search: search || undefined,
              tagId: tagId || undefined,
              perColumn: CARDS_PER_COLUMN,
            },
            { signal },
          ),
        { timeoutMs: REQUEST_TIMEOUT_MS },
      )
      if (requestId === requestIdRef.current) {
        setColumns(result.columns)
      }
    } catch (error) {
      if (requestId === requestIdRef.current && !isAbortError(error)) {
        toast.error(
          error instanceof RequestTimeoutError
            ? t("kanban.loadTimedOut")
            : errorMessage(error, t("messages.errorLoadingData")),
        )
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoadingCards(false)
      }
    }
  }, [workspaceId, selectedBoardId, search, tagId, t])

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
    // Enter is kept for opening the card in the side peek.
    useSensor(KeyboardSensor, {
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    }),
  )

  const handleDragStart = ({ active }: DragStartEvent) => {
    const card = columns
      .flatMap((column) => column.cards)
      .find((item) => item.contactId === String(active.id))
    setActiveCard(card ?? null)
  }

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveCard(null)
    lastDragEndAtRef.current = Date.now()
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

  const handleOpenCard = useCallback(
    (contactId: string) => {
      if (Date.now() - lastDragEndAtRef.current < CLICK_AFTER_DRAG_MS) {
        return
      }
      openContact(contactId)
    },
    [openContact],
  )

  // Peek ↑/↓ walks the board column by column, top to bottom.
  const peekContactIds = useMemo(
    () =>
      uniqueInOrder(
        columns.flatMap((column) => column.cards.map((card) => card.contactId)),
      ),
    [columns],
  )
  const chatHref = useCallback(
    (conversationId: string) =>
      flowId
        ? flowChatsHref(workspaceId, flowId, conversationId)
        : `/space/${workspaceId}/inbox?conversationId=${conversationId}`,
    [flowId, workspaceId],
  )

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

  if (boardsStatus === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (boardsStatus === "failed" || boardsStatus === "timedOut") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
        role="alert"
      >
        <p className="font-semibold">{t("kanban.loadFailed")}</p>
        <p className="text-muted-foreground text-sm">
          {boardsStatus === "timedOut"
            ? t("kanban.loadTimedOut")
            : t("messages.errorLoadingData")}
        </p>
        <Button
          onClick={() => setBoardsReloadKey((key) => key + 1)}
          type="button"
          variant="outline"
        >
          <RefreshCwIcon />
          {t("kanban.retry")}
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex h-[calc(100vh-7rem)] min-h-0 flex-col gap-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {hideTitle ? null : (
            <h4 className="font-bold text-xl">{t("kanban.title")}</h4>
          )}
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
            onDragCancel={() => {
              setActiveCard(null)
              lastDragEndAtRef.current = Date.now()
            }}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            sensors={sensors}
          >
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
              {columns.map((column) => (
                <KanbanColumn
                  activeContactId={peekContactId}
                  column={column}
                  display={cardDisplay}
                  key={column.id}
                  loadingMore={loadingMoreColumnId === column.id}
                  onLoadMore={handleLoadMore}
                  onOpenCard={handleOpenCard}
                />
              ))}
            </div>
            <DragOverlay>
              {activeCard ? (
                <KanbanCard card={activeCard} display={cardDisplay} overlay />
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <SquareKanbanIcon className="size-10 text-muted-foreground" />
          <h5 className="font-semibold">{t("kanban.emptyTitle")}</h5>
          <p className="max-w-md text-muted-foreground text-sm">
            {t(
              flowId
                ? "kanban.emptyFlowDescription"
                : "kanban.emptyDescription",
            )}
          </p>
          {canManageBoards ? (
            <Button onClick={openCreateDialog} type="button">
              <PlusIcon />
              {t("kanban.newBoard")}
            </Button>
          ) : null}
        </div>
      )}

      <ContactPeek
        chatHref={chatHref}
        contactIds={peekContactIds}
        workspaceId={workspaceId}
      />

      <KanbanBoardDialog
        board={editingBoard}
        defaultTemplate={defaultTemplate}
        flowId={flowId}
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
