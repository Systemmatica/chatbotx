"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "flow-canvas:outline-open"

const readStoredOpen = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

const writeStoredOpen = (open: boolean) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0")
  } catch {
    // Storage can be blocked (private mode, policies); the panel still works.
  }
}

/** Open state of the block outline panel, remembered per browser. */
export function useOutlineOpen() {
  const [open, setOpen] = useState(false)

  // Read after mount so the server render and the first client render agree.
  useEffect(() => {
    setOpen(readStoredOpen())
  }, [])

  const toggle = useCallback(() => {
    setOpen((current) => {
      writeStoredOpen(!current)
      return !current
    })
  }, [])

  return { open, toggle }
}
