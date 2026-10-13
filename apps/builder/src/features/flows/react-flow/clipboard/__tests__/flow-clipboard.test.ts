import {
  buttonTypes,
  conditionNodeDefaultFn,
  type FlowNode,
  sendMessageNodeDefaultFn,
  sendTextStepDefaultFn,
  splitTrafficNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
} from "@chatbotx.io/flow-config"
import type { Edge } from "@xyflow/react"
import { describe, expect, test } from "vitest"
import {
  buildClipboardPayload,
  FLOW_CLIPBOARD_TYPE,
  FLOW_CLIPBOARD_VERSION,
  type FlowClipboardPayload,
  instantiateClipboardPayload,
  PASTE_OFFSET,
  parseClipboardPayload,
  resolvePasteTranslation,
  serializeClipboardPayload,
} from "../flow-clipboard"

const routedButton = (id: string, label: string, targetNodeId: string) => ({
  id,
  label,
  buttonType: buttonTypes.enum.startAnotherNode,
  beforeStep: startAnotherNodeStepDefaultFn({
    nodeId: targetNodeId,
    viewOnly: true,
  }),
  steps: [],
})

/**
 * A (start, message: button b1 -> B, button b2 -> C) ─┬─> B (condition)
 *                                                     ├─> C (not copied)
 *                                                     └─> D (split traffic)
 * B case -> D, B otherwise -> C, D case 0 -> B.
 */
const buildCanvas = () => {
  const nodeA = sendMessageNodeDefaultFn({
    nodeProps: { id: "100", position: { x: 100, y: 200 } },
    dataProps: { name: "Welcome", isStartNode: true },
  })
  const textStep = sendTextStepDefaultFn({
    text: "Hi",
    buttons: [
      routedButton("b1", "To B", "200"),
      routedButton("b2", "To C", "300"),
    ],
  })
  nodeA.data.details.steps = [textStep]

  const nodeB = conditionNodeDefaultFn({
    nodeProps: { id: "200", position: { x: 500, y: 100 } },
  })
  const nodeC = sendMessageNodeDefaultFn({
    nodeProps: { id: "300", position: { x: 900, y: 400 } },
  })
  const nodeD = splitTrafficNodeDefaultFn({
    nodeProps: { id: "400", position: { x: 500, y: 600 } },
  })

  const conditionStep = nodeB.data.details.steps[0]
  const caseId = conditionStep.cases[0].id
  const otherwiseId = conditionStep.otherwiseId

  const nodes = [
    {
      ...nodeA,
      selected: true,
      data: { ...nodeA.data, forceToolbarVisible: true },
    },
    { ...nodeB, selected: true },
    nodeC,
    { ...nodeD, selected: true },
  ] as unknown as FlowNode[]

  const edges: Edge[] = [
    {
      id: "e1",
      source: "100",
      sourceHandle: "b1",
      target: "200",
      targetHandle: "200",
    },
    {
      id: "e2",
      source: "100",
      sourceHandle: "b2",
      target: "300",
      targetHandle: "300",
    },
    {
      id: "e3",
      source: "100",
      sourceHandle: "100",
      target: "400",
      targetHandle: "400",
    },
    {
      id: "e4",
      source: "200",
      sourceHandle: caseId,
      target: "400",
      targetHandle: "400",
    },
    {
      id: "e5",
      source: "200",
      sourceHandle: otherwiseId,
      target: "300",
      targetHandle: "300",
    },
    {
      id: "e6",
      source: "400",
      sourceHandle: "400-case-0",
      target: "200",
      targetHandle: "200",
    },
  ]

  return { nodes, edges, textStep, caseId, otherwiseId }
}

const copySelection = (canvas = buildCanvas()) =>
  buildClipboardPayload({
    nodes: canvas.nodes,
    edges: canvas.edges,
    selectedIds: new Set(["100", "200", "400"]),
    workspaceId: "ws-1",
    flowId: "flow-1",
  }) as FlowClipboardPayload

/** Every string id-like value inside a node's details. */
const collectIds = (value: unknown, ids: string[] = []): string[] => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectIds(item, ids)
    }
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if ((key === "id" || key === "otherwiseId") && typeof item === "string") {
        ids.push(item)
      } else {
        collectIds(item, ids)
      }
    }
  }
  return ids
}

describe("buildClipboardPayload", () => {
  test("keeps only the selected nodes and the edges between them", () => {
    const payload = copySelection()

    expect(payload.type).toBe(FLOW_CLIPBOARD_TYPE)
    expect(payload.version).toBe(FLOW_CLIPBOARD_VERSION)
    expect(payload.workspaceId).toBe("ws-1")
    expect(payload.nodes.map((node) => node.id)).toEqual(["100", "200", "400"])
    expect(payload.edges.map((edge) => edge.id).sort()).toEqual([
      "e1",
      "e3",
      "e4",
      "e6",
    ])
  })

  test("drops transient canvas state", () => {
    const payload = copySelection()
    const [first] = payload.nodes

    expect("selected" in first).toBe(false)
    expect("forceToolbarVisible" in first.data).toBe(false)
  })

  test("returns null when nothing is selected", () => {
    const { nodes, edges } = buildCanvas()
    expect(
      buildClipboardPayload({
        nodes,
        edges,
        selectedIds: new Set(),
        workspaceId: "ws-1",
        flowId: "flow-1",
      }),
    ).toBeNull()
  })
})

describe("parseClipboardPayload", () => {
  test("round-trips a serialized payload", () => {
    const payload = copySelection()
    expect(parseClipboardPayload(serializeClipboardPayload(payload))).toEqual(
      payload,
    )
  })

  test("rejects foreign text, other markers and other versions", () => {
    const payload = copySelection()
    expect(parseClipboardPayload("hello")).toBeNull()
    expect(parseClipboardPayload("")).toBeNull()
    expect(parseClipboardPayload(null)).toBeNull()
    expect(
      parseClipboardPayload(JSON.stringify({ ...payload, type: "other" })),
    ).toBeNull()
    expect(
      parseClipboardPayload(JSON.stringify({ ...payload, version: 2 })),
    ).toBeNull()
    expect(
      parseClipboardPayload(JSON.stringify({ ...payload, nodes: [] })),
    ).toBeNull()
  })
})

describe("instantiateClipboardPayload", () => {
  test("issues fresh, unique ids for nodes and everything inside them", () => {
    const payload = copySelection()
    const { nodes } = instantiateClipboardPayload(payload, { x: 0, y: 0 })

    const originalIds = new Set([
      ...payload.nodes.map((node) => node.id),
      ...payload.nodes.flatMap((node) => collectIds(node.data.details)),
    ])
    const pastedIds = [
      ...nodes.map((node) => node.id),
      ...nodes.flatMap((node) => collectIds(node.data.details)),
    ]

    expect(pastedIds.length).toBeGreaterThan(nodes.length)
    expect(new Set(pastedIds).size).toBe(pastedIds.length)
    for (const id of pastedIds) {
      expect(originalIds.has(id)).toBe(false)
    }
  })

  test("never pastes a start node and selects every pasted node", () => {
    const { nodes } = instantiateClipboardPayload(copySelection(), {
      x: 0,
      y: 0,
    })

    expect(nodes.every((node) => node.data.isStartNode === false)).toBe(true)
    expect(nodes.every((node) => node.selected === true)).toBe(true)
    expect(nodes[0].data.name).toBe("Welcome")
  })

  test("remaps edges and their handles onto the pasted copies", () => {
    const canvas = buildCanvas()
    const payload = copySelection(canvas)
    const { nodes, edges } = instantiateClipboardPayload(payload, {
      x: 0,
      y: 0,
    })
    const [newA, newB, newD] = nodes
    const newIds = new Set(nodes.map((node) => node.id))

    expect(edges).toHaveLength(4)
    for (const edge of edges) {
      expect(newIds.has(edge.source)).toBe(true)
      expect(newIds.has(edge.target)).toBe(true)
      expect(edge.targetHandle).toBe(edge.target)
      expect(payload.edges.some((original) => original.id === edge.id)).toBe(
        false,
      )
    }

    const steps = (
      newA.data.details as { steps: { buttons: { id: string }[] }[] }
    ).steps
    const newButtonId = steps[0].buttons[0].id
    const conditionStep = (
      newB.data.details as { steps: { cases: { id: string }[] }[] }
    ).steps[0]
    const newCaseId = conditionStep.cases[0].id

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: newA.id,
          sourceHandle: newButtonId,
          target: newB.id,
        }),
        expect.objectContaining({
          source: newA.id,
          sourceHandle: newA.id,
          target: newD.id,
        }),
        expect.objectContaining({
          source: newB.id,
          sourceHandle: newCaseId,
          target: newD.id,
        }),
        expect.objectContaining({
          source: newD.id,
          sourceHandle: `${newD.id}-case-0`,
          target: newB.id,
        }),
      ]),
    )
    expect(newCaseId).not.toBe(canvas.caseId)
  })

  test("keeps button routes inside the copy and clears the rest", () => {
    const { nodes } = instantiateClipboardPayload(copySelection(), {
      x: 0,
      y: 0,
    })
    const [newA, newB] = nodes
    const [toB, toC] = (
      newA.data.details as {
        steps: {
          buttons: {
            label: string
            buttonType: string | null
            beforeStep: { nodeId: string } | null
          }[]
        }[]
      }
    ).steps[0].buttons

    expect(toB.buttonType).toBe(buttonTypes.enum.startAnotherNode)
    expect(toB.beforeStep?.nodeId).toBe(newB.id)
    expect(toC).toMatchObject({
      label: "To C",
      buttonType: null,
      beforeStep: null,
    })
  })

  test("translates positions and never reuses ids across pastes", () => {
    const payload = copySelection()
    const first = instantiateClipboardPayload(payload, { x: 10, y: -20 })
    const second = instantiateClipboardPayload(payload, { x: 10, y: -20 })

    expect(first.nodes.map((node) => node.position)).toEqual([
      { x: 110, y: 180 },
      { x: 510, y: 80 },
      { x: 510, y: 580 },
    ])
    const firstIds = new Set(first.nodes.map((node) => node.id))
    expect(second.nodes.some((node) => firstIds.has(node.id))).toBe(false)
  })
})

describe("resolvePasteTranslation", () => {
  const nodes = [
    { position: { x: 100, y: 200 } },
    { position: { x: 300, y: 50 } },
  ]

  test("moves the group's top-left corner to the pointer", () => {
    expect(resolvePasteTranslation({ nodes, anchor: { x: 0, y: 0 } })).toEqual({
      x: -100,
      y: -50,
    })
  })

  test("offsets from the originals without a pointer", () => {
    expect(resolvePasteTranslation({ nodes })).toEqual(PASTE_OFFSET)
  })

  test("cascades while the offset spot is already taken", () => {
    expect(
      resolvePasteTranslation({
        nodes,
        existingPositions: [
          { x: 100, y: 200 },
          { x: 100 + PASTE_OFFSET.x, y: 200 + PASTE_OFFSET.y },
        ],
      }),
    ).toEqual({ x: PASTE_OFFSET.x * 2, y: PASTE_OFFSET.y * 2 })
  })
})
