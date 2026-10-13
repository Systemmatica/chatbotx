"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ContactFilterCriteria } from "@/features/contact-filter/schemas"
import type { KanbanBoardResource } from "@/features/kanban/schemas/resource"
import type { LeadMagnetWithStatsResource } from "@/features/lead-magnets/schemas/resource"
import { client } from "@/lib/orpc/orpc"
import {
  countsByGroupKey,
  type GroupingContext,
  groupBySignature,
} from "../lib/grouping"
import type { ContactViewGroupBy } from "../schemas/config"

/**
 * Boards and lead magnets the grouping menu offers and the grouping needs.
 * Loaded once, the first time they are needed.
 */
export function useGroupingSources(workspaceId: string, enabled: boolean) {
  const [boards, setBoards] = useState<KanbanBoardResource[]>([])
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnetWithStatsResource[]>(
    [],
  )
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled || loaded) {
      return
    }
    setLoaded(true)
    client.kanbanAPI
      .listKanbanBoardsAPI({ workspaceId, flowId: null })
      .then(({ data }) => setBoards(data))
      .catch(() => setBoards([]))
    client.leadMagnetsAPI
      .listLeadMagnetsAPI({ workspaceId })
      .then(({ data }) => setLeadMagnets(data))
      .catch(() => setLeadMagnets([]))
  }, [enabled, loaded, workspaceId])

  return useMemo(() => ({ boards, leadMagnets }), [boards, leadMagnets])
}

export function buildGroupingContext(
  groupBy: ContactViewGroupBy | null,
  sources: {
    boards: KanbanBoardResource[]
    leadMagnets: LeadMagnetWithStatsResource[]
  },
): GroupingContext {
  const board =
    groupBy?.kind === "stage"
      ? sources.boards.find((item) => item.id === groupBy.boardId)
      : undefined
  return {
    board: board
      ? { customFieldId: board.customFieldId, stages: board.stages }
      : null,
    // A lead magnet whose tag was deleted cannot have been received.
    leadMagnets: sources.leadMagnets
      .filter((leadMagnet) => leadMagnet.tagName !== null)
      .map((leadMagnet) => ({ id: leadMagnet.id, tagId: leadMagnet.tagId })),
  }
}

/**
 * Totals per group over the whole filtered list (one request per grouping /
 * filter change). `null` while loading or when the request failed: headers
 * then show only the page's count.
 */
export function useGroupCounts(input: {
  workspaceId: string
  groupBy: ContactViewGroupBy | null
  contactFilter: ContactFilterCriteria | undefined
  keyword: string | undefined
}) {
  const { workspaceId, groupBy, contactFilter, keyword } = input
  const [counts, setCounts] = useState<Map<string, number> | null>(null)
  const filterKey = JSON.stringify(contactFilter ?? null)
  const groupKey = groupBy ? JSON.stringify(groupBy) : null

  useEffect(() => {
    setCounts(null)
    if (!groupKey) {
      return
    }
    let ignore = false
    client.contactViewsAPI
      .countContactGroupsAPI({
        workspaceId,
        keyword,
        contactFilter: JSON.parse(filterKey) ?? undefined,
        groupBy: JSON.parse(groupKey),
      })
      .then(({ data }) => {
        if (!ignore) {
          setCounts(countsByGroupKey(data))
        }
      })
      .catch(() => {
        // Headers fall back to the page counts.
      })
    return () => {
      ignore = true
    }
  }, [workspaceId, keyword, filterKey, groupKey])

  return counts
}

const COLLAPSED_STORAGE_PREFIX = "contacts:collapsed-groups"

/**
 * Collapsed groups, remembered per view and grouping in this browser (a
 * personal preference: collapsing does not change the shared view).
 */
export function useCollapsedGroups(input: {
  workspaceId: string
  viewId: string | null
  groupBy: ContactViewGroupBy | null
}) {
  const { workspaceId, viewId, groupBy } = input
  const storageKey = useMemo(
    () =>
      groupBy
        ? `${COLLAPSED_STORAGE_PREFIX}:${workspaceId}:${viewId ?? "all"}:${groupBySignature(groupBy)}`
        : null,
    [workspaceId, viewId, groupBy],
  )
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!storageKey) {
      setCollapsed(new Set())
      return
    }
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]")
      setCollapsed(
        new Set(
          Array.isArray(stored)
            ? stored.filter((key): key is string => typeof key === "string")
            : [],
        ),
      )
    } catch {
      setCollapsed(new Set())
    }
  }, [storageKey])

  const toggle = useCallback(
    (groupKey: string) => {
      setCollapsed((current) => {
        const next = new Set(current)
        if (next.has(groupKey)) {
          next.delete(groupKey)
        } else {
          next.add(groupKey)
        }
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify([...next]))
          } catch {
            // Storage unavailable (private mode): keep it for this visit.
          }
        }
        return next
      })
    },
    [storageKey],
  )

  return { collapsed, toggle }
}
