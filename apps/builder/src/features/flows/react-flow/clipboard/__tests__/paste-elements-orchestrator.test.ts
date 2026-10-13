import type { FlowNode } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  createPasteElements,
  type PasteElementsDeps,
} from "../paste-elements-orchestrator"

const node = (id: string) => ({ id }) as unknown as FlowNode
const pasted = {
  nodes: [node("p1"), node("p2")],
  edges: [{ id: "pe", source: "p1", target: "p2" }],
}

function makeDeps(
  overrides: Partial<PasteElementsDeps> = {},
): PasteElementsDeps & { calls: string[]; saved: unknown[] } {
  const calls: string[] = []
  const saved: unknown[] = []
  return {
    calls,
    saved,
    isMutatingRef: { current: false },
    setIsFlowMutating: (v) => calls.push(`setIsFlowMutating:${v}`),
    cancelAutosave: () => calls.push("cancelAutosave"),
    getNodes: () => [node("existing")],
    getEdges: () => [],
    saveDraft: (input) => {
      calls.push("saveDraft")
      saved.push(input)
      return Promise.resolve({ data: { ok: true } })
    },
    reveal: () => calls.push("reveal"),
    onError: () => calls.push("onError"),
    ...overrides,
  }
}

describe("createPasteElements", () => {
  test("saves existing plus pasted elements, then reveals and unlocks", async () => {
    const deps = makeDeps()
    const ok = await createPasteElements(deps)(pasted)

    expect(ok).toBe(true)
    expect(deps.calls).toEqual([
      "setIsFlowMutating:true",
      "cancelAutosave",
      "saveDraft",
      "reveal",
      "setIsFlowMutating:false",
    ])
    expect(deps.saved[0]).toEqual({
      nodes: [node("existing"), node("p1"), node("p2")],
      edges: pasted.edges,
    })
    expect(deps.isMutatingRef.current).toBe(false)
  })

  test("leaves the canvas untouched when the save fails", async () => {
    const deps = makeDeps({
      saveDraft: () => Promise.reject(new Error("offline")),
    })
    const ok = await createPasteElements(deps)(pasted)

    expect(ok).toBe(false)
    expect(deps.calls).toContain("onError")
    expect(deps.calls).not.toContain("reveal")
    expect(deps.isMutatingRef.current).toBe(false)
  })

  test("does nothing while another mutation runs or with nothing to paste", async () => {
    const busy = makeDeps({ isMutatingRef: { current: true } })
    expect(await createPasteElements(busy)(pasted)).toBe(false)
    expect(busy.calls).toEqual([])

    const empty = makeDeps()
    expect(await createPasteElements(empty)({ nodes: [], edges: [] })).toBe(
      false,
    )
    expect(empty.calls).toEqual([])
  })
})
