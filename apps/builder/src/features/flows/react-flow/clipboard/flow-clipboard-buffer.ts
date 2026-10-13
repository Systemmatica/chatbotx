import { useSyncExternalStore } from "react"
import {
  type FlowClipboardPayload,
  parseClipboardPayload,
  serializeClipboardPayload,
} from "./flow-clipboard"

/**
 * The in-memory half of the canvas clipboard. It lives at module scope so it
 * outlives a single canvas (switching flows inside the app keeps it) and is
 * the fallback whenever the system clipboard is unavailable or denied.
 */
let buffer: FlowClipboardPayload | null = null
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const hasBufferedPayload = () => buffer !== null

export const getBufferedPayload = () => buffer

/** Stores `payload` and returns its serialized clipboard text. */
export const setBufferedPayload = (payload: FlowClipboardPayload) => {
  buffer = payload
  for (const listener of listeners) {
    listener()
  }
  return serializeClipboardPayload(payload)
}

/** Re-renders when something is copied; `false` on the server. */
export const useHasBufferedPayload = () =>
  useSyncExternalStore(subscribe, hasBufferedPayload, () => false)

/** Best effort: a denied or missing Clipboard API leaves the buffer as is. */
export const writeSystemClipboard = async (text: string) => {
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    // Permission denied or insecure context: the in-memory buffer still works.
  }
}

const readSystemClipboard = async (): Promise<string | null> => {
  try {
    return (await navigator.clipboard?.readText()) ?? null
  } catch {
    return null
  }
}

/**
 * Picks what to paste: a valid payload from the system clipboard first (it
 * may come from another tab or flow), otherwise the in-memory buffer.
 * `clipboardText` is what a paste event already carried; `undefined` means
 * the Clipboard API has to be asked (menu-triggered paste).
 */
export const resolvePastePayload = async (
  clipboardText?: string | null,
): Promise<FlowClipboardPayload | null> => {
  const text =
    clipboardText === undefined ? await readSystemClipboard() : clipboardText
  return parseClipboardPayload(text) ?? buffer
}
