import type { FlowNode } from "@chatbotx.io/flow-config"
import type { Edge } from "@xyflow/react"
import type { DuplicateSaveResult } from "../duplicate-node-orchestrator"
import type { PastedElements } from "./flow-clipboard"

export type PasteElementsDeps = {
  /** Re-entrancy guard shared with duplicate/delete. */
  isMutatingRef: { current: boolean }
  setIsFlowMutating: (value: boolean) => void
  /** Cancels the pending autosave debounce so it cannot clobber this save. */
  cancelAutosave: () => void
  getNodes: () => FlowNode[]
  getEdges: () => Edge[]
  saveDraft: (input: {
    nodes: FlowNode[]
    edges: Edge[]
  }) => Promise<DuplicateSaveResult>
  /** Puts the pasted elements on the canvas (and selects them). */
  reveal: (elements: PastedElements) => void
  /** Invoked when the save did not durably succeed (e.g. an error toast). */
  onError: () => void
}

/**
 * Persist-first paste, mirroring node duplication: the pasted elements are
 * revealed only after the draft save confirms (`result.data.ok === true`), so
 * a refresh mid-save never loses them. On failure the canvas is untouched.
 * Resolves to whether the paste landed.
 */
export function createPasteElements(deps: PasteElementsDeps) {
  return async (elements: PastedElements): Promise<boolean> => {
    if (deps.isMutatingRef.current || elements.nodes.length === 0) {
      return false
    }
    deps.isMutatingRef.current = true
    deps.setIsFlowMutating(true)
    deps.cancelAutosave()

    let result: DuplicateSaveResult
    try {
      result = await deps.saveDraft({
        nodes: [...deps.getNodes(), ...elements.nodes],
        edges: [...deps.getEdges(), ...elements.edges],
      })
    } catch {
      result = undefined
    }

    const ok = result?.data?.ok === true
    if (ok) {
      deps.reveal(elements)
    } else {
      deps.onError()
    }
    deps.setIsFlowMutating(false)
    deps.isMutatingRef.current = false
    return ok
  }
}
