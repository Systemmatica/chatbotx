import {
  applyRouteUpdatesInNodes,
  type FlowNode,
  type FlowRouteUpdate,
  type NodeType,
  nodeTypeSchema,
  sendMessageNodeDefaultFn,
} from "@chatbotx.io/flow-config"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type FinalConnectionState,
  MarkerType,
  type Node,
  type NodeChange,
  Panel,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type XYPosition,
} from "@xyflow/react"
import { useTranslations } from "next-intl"
import { useOptimisticAction } from "next-safe-action/hooks"
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { updateDraftFlowVersionAction } from "../actions/update-draft-flow-version-action"
import type { UpdateDraftFlowVersionSchema } from "../schemas/action"
import type { PastedElements } from "./clipboard/flow-clipboard"
import { createPasteElements } from "./clipboard/paste-elements-orchestrator"
import { useFlowClipboard } from "./clipboard/use-flow-clipboard"
import {
  createDeleteNode,
  type DeleteSaveResult,
} from "./delete-node-orchestrator"
import {
  createDuplicateNode,
  type DuplicateSaveResult,
} from "./duplicate-node-orchestrator"
import { FlowContextMenu, useFlowContextMenu } from "./flow-context-menu"
import {
  type FlowMutationContextValue,
  FlowMutationProvider,
} from "./flow-mutation-context"
import {
  AUTO_LAYOUT_HORIZONTAL_GAP,
  computeAutoLayout,
} from "./layout/auto-layout"
import { NODE_CARD_WIDTH_PX } from "./nodes/node-dimensions"
import { NodeViewer } from "./nodes/viewer"
import AddNodeButton, { addNewNode } from "./panel-buttons/add-node-button"
import AutoLayoutButton from "./panel-buttons/auto-layout-button"
import FocusButton from "./panel-buttons/focus-button"
import ZoomInButton from "./panel-buttons/zoom-in-button"
import ZoomOutButton from "./panel-buttons/zoom-out-button"
import { duplicateFlowNode } from "./toolbar/duplicate-node-data"
import "./react-flow-wrapper.css"
import { createId } from "@chatbotx.io/utils"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { serializeFlowContent } from "../flow-version-content"
import { FlowMiniMap } from "./components/flow-mini-map"
import {
  getRoutableHandleId,
  replaceSourceHandleEdge,
  toRouteRemovals,
} from "./edge-routing"
import ButtonEdge from "./edges/button-edge"
import { findNodeAtPoint } from "./node-hit-test"
import { hasMeaningfulNodeChange } from "./react-flow-node-change"
import { useFlowHistoryStoreApi } from "./stores/flow-history-store-provider"
import { useStepStore } from "./stores/step-store-provider"
import { useFlowHistory } from "./stores/use-flow-history"

function getClientPosition(event: MouseEvent | TouchEvent) {
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  return { x: event.clientX, y: event.clientY }
}

const viewerNodeTypes = {
  [nodeTypeSchema.enum.sendMessage]: NodeViewer,
  [nodeTypeSchema.enum.sendMail]: NodeViewer,
  [nodeTypeSchema.enum.landingPage]: NodeViewer,
  [nodeTypeSchema.enum.performAction]: NodeViewer,
  [nodeTypeSchema.enum.addNotes]: NodeViewer,
  [nodeTypeSchema.enum.wait]: NodeViewer,
  [nodeTypeSchema.enum.followUp]: NodeViewer,
  [nodeTypeSchema.enum.startFlow]: NodeViewer,
  [nodeTypeSchema.enum.splitTraffic]: NodeViewer,
  [nodeTypeSchema.enum.condition]: NodeViewer,
}

const edgeTypes = {
  buttonedge: ButtonEdge,
}

/** Shift-click adds to the selection, like design tools; Ctrl/Cmd too. */
const MULTI_SELECTION_KEYS = ["Shift", "Meta", "Control"]

const toCanvasEdge = (edge: Edge): Edge => ({
  ...edge,
  type: "buttonedge",
  markerEnd: { type: MarkerType.ArrowClosed },
})

type ReactFlowFrameProps = {
  flowVersion: FlowVersionResource
  setOpenNodeDetailSheet: (open: boolean) => void
  onAutosaveFlushChange: (flushAutosave: (() => void) | null) => void
  onAutosaveCancelChange: (cancelAutosave: (() => void) | null) => void
  onDraftDirtiedChange: (dirtied: boolean) => void
  onMarkSavedChange: (
    markSaved: ((nodes: Node[], edges: Edge[]) => void) | null,
  ) => void
}

export function ReactFlowWrapper({
  flowVersion,
  onAutosaveFlushChange,
  onAutosaveCancelChange,
  onDraftDirtiedChange,
  onMarkSavedChange,
  setOpenNodeDetailSheet,
}: ReactFlowFrameProps) {
  const reactFlow = useReactFlow()
  const {
    addNodes,
    getNodes,
    getIntersectingNodes,
    updateNodeData,
    updateEdge,
    getEdges,
    deleteElements,
    screenToFlowPosition,
    fitView,
    getNode,
  } = reactFlow

  const [nodes, setNodes, onNodesChange] = useNodesState(
    flowVersion.nodes as unknown as FlowNode[],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    (flowVersion.edges as unknown as Edge[]).map((edge) => ({
      ...edge,
      type: "buttonedge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
    })),
  )
  const lastSavedSerializedRef = useRef(
    serializeFlowContent(
      flowVersion.nodes as unknown as FlowNode[],
      flowVersion.edges as unknown as Edge[],
    ),
  )

  const { execute: savingDraft, executeAsync: savingDraftAsync } =
    useOptimisticAction(
      updateDraftFlowVersionAction.bind(
        null,
        flowVersion.workspaceId,
        flowVersion.id,
      ),
      {
        currentState: { flowVersion },
        updateFn: (state, updatedData) => ({
          flowVersion: {
            ...state.flowVersion,
            nodes: JSON.parse(JSON.stringify(updatedData.nodes)),
            edges: JSON.parse(JSON.stringify(updatedData.edges)),
          },
        }),
      },
    )

  const handleChanges = useDebouncedCallback(
    (changedNodes: FlowNode[], changedEdges: Edge[]) => {
      savingDraft({
        nodes: changedNodes,
        edges: changedEdges as unknown as UpdateDraftFlowVersionSchema["edges"],
      })
    },
    1500,
    4000,
  )

  const t = useTranslations()
  const [isFlowMutating, setIsFlowMutating] = useState(false)
  const isMutatingRef = useRef(false)
  const snapshotSessionRef = useRef(false)
  // Capture deliberately reads React Flow's internal store here. The restore
  // path writes through the controlled props so undo/redo stays out of
  // onNodesChange/onEdgesChange.
  const { takeSnapshot } = useFlowHistory()
  const historyStore = useFlowHistoryStoreApi()

  // Register the local state setters as the history store's restore handlers so
  // undo/redo write through the controlled nodes/edges props. React Flow's
  // StoreUpdater syncs those props into its internal store WITHOUT firing
  // onNodesChange/onEdgesChange, so restoring never re-enters the snapshot path.
  useEffect(() => {
    const restoreNodes = (restoredNodes: Node[]) =>
      setNodes(restoredNodes as unknown as FlowNode[])

    const restoreEdges = (restoredEdges: Edge[]) =>
      setEdges(restoredEdges.map(toCanvasEdge))

    historyStore
      .getState()
      .setRestoreHandlers({ setNodes: restoreNodes, setEdges: restoreEdges })

    return () => historyStore.getState().setRestoreHandlers(null)
  }, [historyStore, setNodes, setEdges])

  const releaseSnapshotSession = useDebouncedCallback(() => {
    snapshotSessionRef.current = false
  }, 500)

  const takeCoalescedSnapshot = useCallback(() => {
    if (!snapshotSessionRef.current) {
      takeSnapshot()
      snapshotSessionRef.current = true
    }
    releaseSnapshotSession()
  }, [takeSnapshot, releaseSnapshotSession])

  const hasMeaningfulEdgeChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) =>
      changes.some(
        (change) => change.type === "add" || change.type === "remove",
      ),
    [],
  )

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      if (hasMeaningfulNodeChange(changes)) {
        takeCoalescedSnapshot()
      }
      onNodesChange(changes)
    },
    [onNodesChange, takeCoalescedSnapshot],
  )

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      if (hasMeaningfulEdgeChange(changes)) {
        takeCoalescedSnapshot()
      }
      onEdgesChange(changes)
    },
    [hasMeaningfulEdgeChange, onEdgesChange, takeCoalescedSnapshot],
  )

  const handleNodeDragStart = useCallback(() => {
    takeCoalescedSnapshot()
  }, [takeCoalescedSnapshot])

  const handleNodeDragStop = useCallback(() => {
    releaseSnapshotSession()
  }, [releaseSnapshotSession])

  const duplicateNode = useMemo(
    () =>
      createDuplicateNode({
        isMutatingRef,
        setIsFlowMutating,
        cancelAutosave: () => handleChanges.cancel(),
        getNodes: () => getNodes() as unknown as FlowNode[],
        getEdges,
        cloneNode: duplicateFlowNode,
        addNodes,
        // The action input schema types `nodes` as `any[]` (FlowNode[] flows in
        // freely) and `edges` as the zod edge schema, so only `edges` needs a cast.
        // The resolved result is cast to the orchestrator's narrow `DuplicateSaveResult`.
        saveDraft: async (input) =>
          (await savingDraftAsync({
            nodes: input.nodes,
            edges:
              input.edges as unknown as UpdateDraftFlowVersionSchema["edges"],
          })) as DuplicateSaveResult,
        onError: () => toast.error(t("messages.duplicateNodeError")),
      }),
    [getNodes, getEdges, addNodes, handleChanges, savingDraftAsync, t],
  )

  const deleteNode = useMemo(
    () =>
      createDeleteNode({
        isMutatingRef,
        setIsFlowMutating,
        cancelAutosave: () => handleChanges.cancel(),
        deleteElements,
        getNodes: () => getNodes() as unknown as FlowNode[],
        getEdges,
        saveDraft: async (input) =>
          (await savingDraftAsync({
            nodes: input.nodes,
            edges:
              input.edges as unknown as UpdateDraftFlowVersionSchema["edges"],
          })) as DeleteSaveResult,
        onError: () => toast.error(t("messages.deleteNodeError")),
      }),
    [getNodes, getEdges, deleteElements, handleChanges, savingDraftAsync, t],
  )

  const duplicateNodeWithHistory = useCallback(
    async (sourceNode: FlowNode) => {
      takeSnapshot()
      await duplicateNode(sourceNode)
    },
    [duplicateNode, takeSnapshot],
  )

  const deleteNodeWithHistory = useCallback(
    async (nodeIds: string | string[]) => {
      takeSnapshot()
      await deleteNode(nodeIds)
    },
    [deleteNode, takeSnapshot],
  )

  // The pasted elements become the whole selection. Written through the
  // controlled state (like undo/redo) so selection resets do not re-enter the
  // change handlers; the history snapshot is taken explicitly below.
  const revealPastedElements = useCallback(
    (elements: PastedElements) => {
      setNodes((currentNodes) => [
        ...currentNodes.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        ),
        ...elements.nodes,
      ])
      setEdges((currentEdges) => [
        ...currentEdges.map((edge) =>
          edge.selected ? { ...edge, selected: false } : edge,
        ),
        ...elements.edges.map(toCanvasEdge),
      ])
    },
    [setEdges, setNodes],
  )

  const pasteElements = useMemo(
    () =>
      createPasteElements({
        isMutatingRef,
        setIsFlowMutating,
        cancelAutosave: () => handleChanges.cancel(),
        getNodes: () => getNodes() as unknown as FlowNode[],
        getEdges,
        saveDraft: async (input) =>
          (await savingDraftAsync({
            nodes: input.nodes,
            edges:
              input.edges as unknown as UpdateDraftFlowVersionSchema["edges"],
          })) as DuplicateSaveResult,
        reveal: revealPastedElements,
        onError: () => toast.error(t("flowCanvas.pasteError")),
      }),
    [
      getNodes,
      getEdges,
      handleChanges,
      revealPastedElements,
      savingDraftAsync,
      t,
    ],
  )

  const pasteElementsWithHistory = useCallback(
    (elements: PastedElements) => {
      if (isMutatingRef.current) {
        return Promise.resolve(false)
      }
      takeSnapshot()
      return pasteElements(elements)
    },
    [pasteElements, takeSnapshot],
  )

  const openNodeDetailSheet = useStepStore((state) => state.openNodeDetailSheet)
  const openNodeDetailSheetRef = useRef(openNodeDetailSheet)
  useEffect(() => {
    openNodeDetailSheetRef.current = openNodeDetailSheet
  }, [openNodeDetailSheet])

  const getFlowNodes = useCallback(
    () => getNodes() as unknown as FlowNode[],
    [getNodes],
  )
  const isClipboardBlocked = useCallback(
    () => openNodeDetailSheetRef.current || isMutatingRef.current,
    [],
  )

  const clipboard = useFlowClipboard({
    workspaceId: flowVersion.workspaceId,
    flowId: flowVersion.flowId,
    getNodes: getFlowNodes,
    getEdges,
    screenToFlowPosition,
    isBlocked: isClipboardBlocked,
    pasteElements: pasteElementsWithHistory,
    deleteNodes: deleteNodeWithHistory,
  })

  useEffect(() => {
    const serialized = serializeFlowContent(nodes, edges as Edge[])
    if (serialized === lastSavedSerializedRef.current) {
      return
    }

    lastSavedSerializedRef.current = serialized
    onDraftDirtiedChange(true)
    handleChanges(nodes, edges)
  }, [handleChanges, nodes, edges, onDraftDirtiedChange])

  const markSaved = useCallback(
    (savedNodes: Node[], savedEdges: Edge[]) => {
      lastSavedSerializedRef.current = serializeFlowContent(
        savedNodes,
        savedEdges,
      )
      onDraftDirtiedChange(false)
    },
    [onDraftDirtiedChange],
  )

  useEffect(() => {
    onAutosaveFlushChange(handleChanges.flush)
    onAutosaveCancelChange(handleChanges.cancel)
    onMarkSavedChange(markSaved)

    return () => {
      onAutosaveFlushChange(null)
      onAutosaveCancelChange(null)
      onMarkSavedChange(null)
    }
  }, [
    handleChanges.cancel,
    handleChanges.flush,
    markSaved,
    onAutosaveCancelChange,
    onAutosaveFlushChange,
    onMarkSavedChange,
  ])

  useEffect(
    () => () => {
      releaseSnapshotSession.cancel()
    },
    [releaseSnapshotSession],
  )

  const handleNodeClick = useCallback(
    (event: ReactMouseEvent) => {
      // A modifier click edits the selection instead of opening the editor.
      const isSelectionClick = event.shiftKey || event.metaKey || event.ctrlKey
      setOpenNodeDetailSheet(!isSelectionClick)
    },
    [setOpenNodeDetailSheet],
  )

  const handlePaneClick = useCallback(() => {
    setOpenNodeDetailSheet(false)
  }, [setOpenNodeDetailSheet])

  const onNodeMouseEnter = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      updateNodeData(node.id, { forceToolbarVisible: true })
    },
    [updateNodeData],
  )

  const onNodeMouseLeave = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      updateNodeData(node.id, { forceToolbarVisible: false })
    },
    [updateNodeData],
  )

  const applyButtonRoutes = useCallback(
    (routeUpdates: readonly FlowRouteUpdate[]) => {
      setNodes((currentNodes) =>
        applyRouteUpdatesInNodes(currentNodes, routeUpdates),
      )
    },
    [setNodes],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source === params.target) {
        return
      }

      takeCoalescedSnapshot()
      setEdges((currentEdges) =>
        replaceSourceHandleEdge(currentEdges, {
          ...params,
          type: "buttonedge",
        }),
      )

      const handleId = getRoutableHandleId(params.source, params.sourceHandle)
      if (handleId) {
        applyButtonRoutes([
          {
            sourceNodeId: params.source,
            handleId,
            route: { targetNodeId: params.target },
          },
        ])
      }
    },
    [applyButtonRoutes, setEdges, takeCoalescedSnapshot],
  )

  /** Wires `fromHandleId` on `fromNodeId` to `targetNodeId` (one edge per handle). */
  const connectHandleToNode = useCallback(
    (fromNodeId: string, fromHandleId: string, targetNodeId: string) => {
      setEdges((currentEdges) =>
        replaceSourceHandleEdge(currentEdges, {
          id: createId(),
          source: fromNodeId,
          target: targetNodeId,
          sourceHandle: fromHandleId,
          targetHandle: targetNodeId,
          type: "buttonedge",
        }),
      )

      const routableHandleId = getRoutableHandleId(fromNodeId, fromHandleId)
      if (routableHandleId) {
        applyButtonRoutes([
          {
            sourceNodeId: fromNodeId,
            handleId: routableHandleId,
            route: { targetNodeId },
          },
        ])
      }
    },
    [applyButtonRoutes, setEdges],
  )

  const createNodeAt = useCallback(
    (nodeType: NodeType, position: XYPosition) => {
      takeCoalescedSnapshot()
      return addNewNode(reactFlow, nodeType, t, { position })
    },
    [reactFlow, t, takeCoalescedSnapshot],
  )

  const addNextNode = useCallback<FlowMutationContextValue["addNextNode"]>(
    ({ sourceNodeId, sourceHandleId, nodeType }) => {
      const sourceNode = getNode(sourceNodeId)
      if (!sourceNode || isMutatingRef.current) {
        return
      }

      const newNode = createNodeAt(nodeType, {
        x:
          sourceNode.position.x +
          (sourceNode.measured?.width ?? NODE_CARD_WIDTH_PX) +
          AUTO_LAYOUT_HORIZONTAL_GAP,
        y: sourceNode.position.y,
      })
      if (newNode) {
        connectHandleToNode(sourceNodeId, sourceHandleId, newNode.id)
      }
    },
    [connectHandleToNode, createNodeAt, getNode],
  )

  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      connectionState: FinalConnectionState,
    ): void => {
      const fromHandle = connectionState.fromHandle
      const fromNode = connectionState.fromNode
      if (
        !(fromHandle?.id && fromNode) ||
        fromHandle.type !== "source" ||
        connectionState.toHandle ||
        connectionState.toNode
      ) {
        return
      }

      const fromHandleId = fromHandle.id
      // connectionState.to is pane-relative; screenToFlowPosition needs raw
      // viewport client coordinates, so derive them from the event itself.
      const clientPosition = getClientPosition(event)
      const position = clientPosition
        ? screenToFlowPosition(clientPosition)
        : { x: 300, y: 300 }

      const droppedOnNode = clientPosition
        ? findNodeAtPoint(getIntersectingNodes, position, fromNode.id)
        : undefined

      if (droppedOnNode) {
        takeCoalescedSnapshot()
        connectHandleToNode(fromNode.id, fromHandleId, droppedOnNode.id)
        return
      }

      const messageNodesLength = getNodes().filter(
        (node) => node.type === nodeTypeSchema.enum.sendMessage,
      ).length
      const newNode = sendMessageNodeDefaultFn({
        nodeProps: { position },
        dataProps: {
          name: `${t("actions.sendMessage")} #${messageNodesLength + 1}`,
        },
      })

      takeCoalescedSnapshot()
      addNodes([newNode])
      connectHandleToNode(fromNode.id, fromHandleId, newNode.id)
    },
    [
      addNodes,
      getNodes,
      getIntersectingNodes,
      connectHandleToNode,
      screenToFlowPosition,
      takeCoalescedSnapshot,
      t,
    ],
  )

  const onEdgeMouseEnter = useCallback(
    (_event: ReactMouseEvent, edge: Edge) => {
      const edgeId = edge.id

      // Updates edge
      updateEdge(edgeId, (oldEdge) => ({
        data: { ...oldEdge.data, isHovered: true },
      }))
    },
    [updateEdge],
  )

  const onEdgeMouseLeave = useCallback(
    (_event: ReactMouseEvent, edge: Edge) => {
      const edgeId = edge.id
      updateEdge(edgeId, (oldEdge) => ({
        data: { ...oldEdge.data, isHovered: false },
      }))
    },
    [updateEdge],
  )

  const flowMutationValue = useMemo<FlowMutationContextValue>(
    () => ({
      addNextNode,
      deleteNode: deleteNodeWithHistory,
      duplicateNode: duplicateNodeWithHistory,
      isFlowMutating,
    }),
    [
      addNextNode,
      isFlowMutating,
      duplicateNodeWithHistory,
      deleteNodeWithHistory,
    ],
  )

  const [isAutoLayoutRunning, setIsAutoLayoutRunning] = useState(false)

  // Rearranges every node left-to-right. Positions go through onNodesChange,
  // the same path a manual drag takes, so the result lands in undo history,
  // flips the draft to "unsaved" and is picked up by the autosave.
  const handleAutoLayout = useCallback(async () => {
    if (isMutatingRef.current) {
      return
    }
    const currentNodes = getNodes() as unknown as FlowNode[]
    setIsAutoLayoutRunning(true)
    try {
      const positions = await computeAutoLayout(
        currentNodes.map((node) => ({
          id: node.id,
          position: node.position,
          width: node.measured?.width,
          height: node.measured?.height,
          isStartNode: Boolean(node.data.isStartNode),
        })),
        getEdges(),
      )

      const changes: NodeChange<FlowNode>[] = []
      for (const node of currentNodes) {
        const next = positions[node.id]
        if (
          next &&
          (next.x !== node.position.x || next.y !== node.position.y)
        ) {
          changes.push({ type: "position", id: node.id, position: next })
        }
      }

      if (changes.length > 0) {
        takeSnapshot()
        onNodesChange(changes)
      }
      // Let React Flow commit the new positions before framing them.
      requestAnimationFrame(() => {
        fitView({ duration: 300 }).catch(() => undefined)
      })
    } catch {
      toast.error(t("flowCanvas.autoLayoutError"))
    } finally {
      setIsAutoLayoutRunning(false)
    }
  }, [fitView, getEdges, getNodes, onNodesChange, takeSnapshot, t])

  const {
    canCutNode,
    canPaste,
    copyFromMenu,
    cutFromMenu,
    pasteFromMenu,
    onPointerLeave,
    onPointerMove,
  } = clipboard
  const contextMenu = useFlowContextMenu()
  const { setTarget: setContextMenuTarget } = contextMenu

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      setContextMenuTarget({
        kind: "pane",
        position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      })
    },
    [screenToFlowPosition, setContextMenuTarget],
  )

  const onNodeContextMenu = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      setContextMenuTarget({
        kind: "node",
        nodeId: node.id,
        canDelete: !(node as unknown as FlowNode).data.isStartNode,
        canCut: canCutNode(node.id),
      })
    },
    [canCutNode, setContextMenuTarget],
  )

  const contextMenuActions = useMemo(
    () => ({
      disabled: isFlowMutating,
      onCreateBlock: (position: XYPosition) => {
        createNodeAt(nodeTypeSchema.enum.sendMessage, position)
      },
      onCreateCondition: (position: XYPosition) => {
        createNodeAt(nodeTypeSchema.enum.condition, position)
      },
      onDuplicateNode: (nodeId: string) => {
        const sourceNode = getNode(nodeId)
        if (sourceNode) {
          duplicateNodeWithHistory(sourceNode as unknown as FlowNode).catch(
            () => undefined,
          )
        }
      },
      onDeleteNode: (nodeId: string) => {
        deleteNodeWithHistory(nodeId).catch(() => undefined)
      },
      onCopyNode: copyFromMenu,
      onCutNode: (nodeId: string) => {
        cutFromMenu(nodeId).catch(() => undefined)
      },
      onPaste: canPaste
        ? (position: XYPosition) => {
            pasteFromMenu(position).catch(() => undefined)
          }
        : null,
    }),
    [
      canPaste,
      copyFromMenu,
      createNodeAt,
      cutFromMenu,
      deleteNodeWithHistory,
      pasteFromMenu,
      duplicateNodeWithHistory,
      getNode,
      isFlowMutating,
    ],
  )

  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      takeCoalescedSnapshot()
      applyButtonRoutes(toRouteRemovals(edges))
    },
    [applyButtonRoutes, takeCoalescedSnapshot],
  )

  return (
    <FlowMutationProvider value={flowMutationValue}>
      <FlowContextMenu actions={contextMenuActions} menu={contextMenu}>
        <ReactFlow
          defaultEdgeOptions={{
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
            style: {
              strokeWidth: 2,
            },
          }}
          deleteKeyCode={isFlowMutating ? null : undefined}
          edges={edges}
          edgeTypes={edgeTypes}
          elementsSelectable={!isFlowMutating}
          maxZoom={10}
          minZoom={0.1}
          multiSelectionKeyCode={MULTI_SELECTION_KEYS}
          nodes={nodes}
          nodesConnectable={!isFlowMutating}
          nodesDraggable={!isFlowMutating}
          nodeTypes={viewerNodeTypes}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          onEdgesChange={handleEdgesChange}
          onEdgesDelete={onEdgesDelete}
          onMouseLeave={onPointerLeave}
          onMouseMove={onPointerMove}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onNodesChange={handleNodesChange}
          onPaneClick={handlePaneClick}
          onPaneContextMenu={onPaneContextMenu}
          proOptions={{ hideAttribution: true }}
          selectionMode={SelectionMode.Partial}
        >
          {isFlowMutating && (
            <div
              className="absolute inset-0 z-50 cursor-wait bg-white/40 dark:bg-black/40"
              data-testid="flow-mutation-overlay"
            />
          )}
          <Background />
          <FlowMiniMap />
          <Panel className="w-[310px]" position="bottom-center">
            <Controls
              className="overflow-hidden rounded-md shadow-none!"
              orientation="horizontal"
              showFitView={false}
              showInteractive={false}
              showZoom={false}
            >
              <FocusButton />
              <ZoomInButton />
              <ZoomOutButton />
              <AddNodeButton />
              <AutoLayoutButton
                disabled={isFlowMutating}
                isRunning={isAutoLayoutRunning}
                onClick={() => {
                  handleAutoLayout().catch(() => undefined)
                }}
              />
            </Controls>
          </Panel>
        </ReactFlow>
      </FlowContextMenu>
    </FlowMutationProvider>
  )
}
