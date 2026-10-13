import type { FlowNode } from "@chatbotx.io/flow-config"
import type { Edge, XYPosition } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import {
  buildClipboardPayload,
  type FlowClipboardPayload,
  instantiateClipboardPayload,
  type PastedElements,
  resolvePasteTranslation,
} from "./flow-clipboard"
import {
  resolvePastePayload,
  setBufferedPayload,
  useHasBufferedPayload,
  writeSystemClipboard,
} from "./flow-clipboard-buffer"
import {
  hasTextSelection,
  isForeignClipboardTarget,
} from "./flow-clipboard-events"

type UseFlowClipboardOptions = {
  workspaceId: string
  flowId: string
  getNodes: () => FlowNode[]
  getEdges: () => Edge[]
  screenToFlowPosition: (position: XYPosition) => XYPosition
  /** True while the node editor sheet is open or a mutation is in flight. */
  isBlocked: () => boolean
  /** Persist-first paste with history; resolves to whether it landed. */
  pasteElements: (elements: PastedElements) => Promise<boolean>
  /** Delete-with-history for the cut half of a cut. */
  deleteNodes: (nodeIds: string[]) => Promise<void>
}

const isStartNode = (node: FlowNode) => Boolean(node.data.isStartNode)

/**
 * Copy / cut / paste of canvas blocks.
 *
 * Keyboard shortcuts go through the document's `copy` / `cut` / `paste`
 * events rather than raw keydown: the browser hands those events a clipboard
 * that can be written and read without a permission prompt, and they already
 * skip IME composition and OS-level remapping. Text fields, editors, dialogs
 * (the node editor sheet included) and real text selections are left alone.
 * Menu-triggered actions use the async Clipboard API on a best-effort basis;
 * the in-memory buffer covers whatever the system clipboard cannot.
 */
export function useFlowClipboard({
  workspaceId,
  flowId,
  getNodes,
  getEdges,
  screenToFlowPosition,
  isBlocked,
  pasteElements,
  deleteNodes,
}: UseFlowClipboardOptions) {
  const t = useTranslations()
  const canPaste = useHasBufferedPayload()
  /** Last pointer position over the canvas, in client coordinates. */
  const pointerRef = useRef<XYPosition | null>(null)

  const onPointerMove = useCallback(
    (event: { clientX: number; clientY: number }) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    },
    [],
  )

  const onPointerLeave = useCallback(() => {
    pointerRef.current = null
  }, [])

  /** The right-clicked node's whole selection, or just that node. */
  const resolveTargetIds = useCallback(
    (nodeId?: string): Set<string> => {
      const nodes = getNodes()
      const selected = nodes.filter((node) => node.selected)
      if (nodeId && !selected.some((node) => node.id === nodeId)) {
        return new Set([nodeId])
      }
      return new Set(selected.map((node) => node.id))
    },
    [getNodes],
  )

  /** Buffers the selection; returns the payload and its clipboard text. */
  const copyNodes = useCallback(
    (nodeIds: ReadonlySet<string>) => {
      const payload = buildClipboardPayload({
        nodes: getNodes(),
        edges: getEdges(),
        selectedIds: nodeIds,
        workspaceId,
        flowId,
      })
      return payload ? { payload, text: setBufferedPayload(payload) } : null
    },
    [flowId, getEdges, getNodes, workspaceId],
  )

  const removeCopiedNodes = useCallback(
    async (payload: FlowClipboardPayload) => {
      const nodes = getNodes()
      const copiedIds = new Set(payload.nodes.map((node) => node.id))
      const copied = nodes.filter((node) => copiedIds.has(node.id))
      const removable = copied.filter((node) => !isStartNode(node))
      if (removable.length < copied.length) {
        toast.info(t("flowCanvas.startBlockNotCut"))
      }
      if (removable.length > 0) {
        await deleteNodes(removable.map((node) => node.id))
      }
    },
    [deleteNodes, getNodes, t],
  )

  const pastePayload = useCallback(
    async (payload: FlowClipboardPayload | null, anchor: XYPosition | null) => {
      if (!payload) {
        return
      }
      if (payload.workspaceId !== workspaceId) {
        toast.error(t("flowCanvas.pasteOtherWorkspace"))
        return
      }
      const translation = resolvePasteTranslation({
        nodes: payload.nodes,
        anchor,
        existingPositions: getNodes().map((node) => node.position),
      })
      await pasteElements(instantiateClipboardPayload(payload, translation))
    },
    [getNodes, pasteElements, t, workspaceId],
  )

  // Menu actions --------------------------------------------------------------

  const copyFromMenu = useCallback(
    (nodeId: string) => {
      const copied = copyNodes(resolveTargetIds(nodeId))
      if (copied) {
        writeSystemClipboard(copied.text).catch(() => undefined)
      }
    },
    [copyNodes, resolveTargetIds],
  )

  const cutFromMenu = useCallback(
    async (nodeId: string) => {
      if (isBlocked()) {
        return
      }
      const copied = copyNodes(resolveTargetIds(nodeId))
      if (!copied) {
        return
      }
      writeSystemClipboard(copied.text).catch(() => undefined)
      await removeCopiedNodes(copied.payload)
    },
    [copyNodes, isBlocked, removeCopiedNodes, resolveTargetIds],
  )

  /** Pastes at `position` (flow coordinates), e.g. where the menu opened. */
  const pasteFromMenu = useCallback(
    async (position: XYPosition) => {
      if (isBlocked()) {
        return
      }
      await pastePayload(await resolvePastePayload(), position)
    },
    [isBlocked, pastePayload],
  )

  /** Whether the right-clicked node's targets include something cuttable. */
  const canCutNode = useCallback(
    (nodeId: string) => {
      const ids = resolveTargetIds(nodeId)
      return getNodes().some((node) => ids.has(node.id) && !isStartNode(node))
    },
    [getNodes, resolveTargetIds],
  )

  // Keyboard shortcuts --------------------------------------------------------

  // The listeners read the latest callbacks through a ref so they are bound
  // once instead of on every canvas render.
  const handlersRef = useRef({
    copyNodes,
    isBlocked,
    pastePayload,
    removeCopiedNodes,
    resolveTargetIds,
    screenToFlowPosition,
  })
  useEffect(() => {
    handlersRef.current = {
      copyNodes,
      isBlocked,
      pastePayload,
      removeCopiedNodes,
      resolveTargetIds,
      screenToFlowPosition,
    }
  })

  useEffect(() => {
    const isCanvasEvent = (event: ClipboardEvent) =>
      !(
        event.defaultPrevented ||
        handlersRef.current.isBlocked() ||
        isForeignClipboardTarget(event.target)
      )

    const onCopyOrCut = (event: ClipboardEvent) => {
      if (!isCanvasEvent(event) || hasTextSelection(window.getSelection())) {
        return
      }
      const handlers = handlersRef.current
      const ids = handlers.resolveTargetIds()
      if (ids.size === 0) {
        return
      }
      const copied = handlers.copyNodes(ids)
      if (!copied) {
        return
      }
      event.preventDefault()
      event.clipboardData?.setData("text/plain", copied.text)
      if (event.type === "cut") {
        handlers.removeCopiedNodes(copied.payload).catch(() => undefined)
      }
    }

    const onPaste = (event: ClipboardEvent) => {
      if (!isCanvasEvent(event)) {
        return
      }
      const handlers = handlersRef.current
      const pointer = pointerRef.current
      const anchor = pointer ? handlers.screenToFlowPosition(pointer) : null
      const text = event.clipboardData?.getData("text/plain") ?? null
      event.preventDefault()
      resolvePastePayload(text)
        .then((payload) => handlers.pastePayload(payload, anchor))
        .catch(() => undefined)
    }

    document.addEventListener("copy", onCopyOrCut)
    document.addEventListener("cut", onCopyOrCut)
    document.addEventListener("paste", onPaste)
    return () => {
      document.removeEventListener("copy", onCopyOrCut)
      document.removeEventListener("cut", onCopyOrCut)
      document.removeEventListener("paste", onPaste)
    }
  }, [])

  return {
    canPaste,
    canCutNode,
    copyFromMenu,
    cutFromMenu,
    pasteFromMenu,
    onPointerMove,
    onPointerLeave,
  }
}
