import { beforeEach, describe, expect, test, vi } from "vitest"
import { createFlowHistoryStore } from "../stores/flow-history-store"
import {
  createUndoGuard,
  DELETED_UNDO_TOAST_ID,
  showUndoToast,
} from "../undo-toast"

const toastMock = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: toastMock }))

const node = (id: string) => ({ id, position: { x: 0, y: 0 }, data: {} })

const setup = () => {
  const store = createFlowHistoryStore()
  const restored: string[][] = []
  store.getState().setRestoreHandlers({
    setNodes: (nodes) => restored.push(nodes.map((item) => item.id)),
    setEdges: () => undefined,
  })
  // a deletion: snapshot of the canvas before the block disappears
  store.getState().takeSnapshot([node("1"), node("2")], [])
  const guard = createUndoGuard(() => store.getState().past.at(-1))
  return { store, guard, restored }
}

describe("createUndoGuard", () => {
  test("holds while the deletion is the newest history entry", () => {
    const { guard } = setup()
    expect(guard.isLatest()).toBe(true)
  })

  test("drops once a later change was recorded", () => {
    const { store, guard } = setup()
    store.getState().takeSnapshot([node("1")], [])
    expect(guard.isLatest()).toBe(false)
  })

  test("drops once the deletion was already undone", () => {
    const { store, guard } = setup()
    store.getState().undo({ nodes: [node("1")], edges: [] })
    expect(guard.isLatest()).toBe(false)
  })

  test("never holds for an empty history", () => {
    const guard = createUndoGuard(() => undefined)
    expect(guard.isLatest()).toBe(false)
  })
})

describe("showUndoToast", () => {
  beforeEach(() => {
    toastMock.mockReset()
  })

  const clickAction = () => {
    const options = toastMock.mock.calls[0]?.[1] as {
      id: string
      action: { label: string; onClick: () => void }
    }
    expect(options.id).toBe(DELETED_UNDO_TOAST_ID)
    options.action.onClick()
    return options
  }

  test("the action undoes while the guard holds", () => {
    const { store, guard, restored } = setup()
    const undo = vi.fn(() => {
      store.getState().undo({ nodes: [node("1")], edges: [] })
    })
    showUndoToast({
      message: "Deleted",
      actionLabel: "Undo",
      canUndo: guard.isLatest,
      undo,
    })

    expect(toastMock).toHaveBeenCalledWith("Deleted", expect.anything())
    expect(clickAction().action.label).toBe("Undo")
    expect(undo).toHaveBeenCalledTimes(1)
    expect(restored).toEqual([["1", "2"]])
  })

  test("the action only closes the toast when something newer exists", () => {
    const { store, guard } = setup()
    const undo = vi.fn()
    showUndoToast({
      message: "Deleted",
      actionLabel: "Undo",
      canUndo: guard.isLatest,
      undo,
    })
    store.getState().takeSnapshot([node("1")], [])

    clickAction()
    expect(undo).not.toHaveBeenCalled()
  })
})
