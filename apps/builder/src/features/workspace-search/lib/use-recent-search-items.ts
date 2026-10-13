"use client"

import { useCallback, useEffect, useState } from "react"
import {
  parseRecentSearchItems,
  pushRecentSearchItem,
  recentSearchItemsStorageKey,
  type SearchItem,
} from "./search-items"

const readStored = (workspaceId: string): SearchItem[] => {
  try {
    return parseRecentSearchItems(
      window.localStorage.getItem(recentSearchItemsStorageKey(workspaceId)),
    )
  } catch {
    return []
  }
}

/** Recently opened search results, per workspace, kept in localStorage. */
export function useRecentSearchItems(workspaceId: string) {
  const [items, setItems] = useState<SearchItem[]>([])

  useEffect(() => {
    setItems(readStored(workspaceId))
  }, [workspaceId])

  const remember = useCallback(
    (item: SearchItem) => {
      const next = pushRecentSearchItem(readStored(workspaceId), item)
      setItems(next)
      try {
        window.localStorage.setItem(
          recentSearchItemsStorageKey(workspaceId),
          JSON.stringify(next),
        )
      } catch {
        // Storage can be full or blocked (private mode); recents are optional.
      }
    },
    [workspaceId],
  )

  return { items, remember }
}
