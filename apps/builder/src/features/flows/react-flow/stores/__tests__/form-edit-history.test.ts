import type { Node } from "@xyflow/react"
import { describe, expect, test } from "vitest"
import { createFlowHistoryStore } from "../flow-history-store"
import { createFormEditHistory } from "../form-edit-history"

const details = (text: string) => ({
  steps: [{ id: "step-1", stepType: "sendText", text, version: "v2" }],
})

const node = (text: string) =>
  ({
    id: "node-1",
    data: { details: details(text) },
    position: { x: 0, y: 0 },
  }) as Node

/** The node editor form wired to a real history store, as `NodeEditor` does. */
const setup = (text = "Hello") => {
  const store = createFlowHistoryStore()
  const canvas = { nodes: [node(text)], edges: [] }
  const history = createFormEditHistory({
    initialValues: details(text),
    takeSnapshot: () =>
      store.getState().takeSnapshot(canvas.nodes, canvas.edges),
  })
  return { history, store }
}

describe("createFormEditHistory", () => {
  test("opening an editor whose fields echo their seed values records nothing", () => {
    const { history, store } = setup()

    // a rich-text field re-emitting its content on mount, twice
    expect(history.onChange(details("Hello"), true)).toBe(false)
    expect(history.onChange(details("Hello"), true)).toBe(false)
    history.release()

    expect(store.getState().past).toHaveLength(0)
  })

  test("programmatic writes never snapshot, and their values become the baseline", () => {
    const { history, store } = setup()

    // e.g. a button dialog writing back through setValue
    expect(history.onChange(details("Set by code"), false)).toBe(false)
    // the field then echoes that value as a "change"
    expect(history.onChange(details("Set by code"), true)).toBe(false)

    expect(store.getState().past).toHaveLength(0)
  })

  test("a real edit records one entry per burst of typing", () => {
    const { history, store } = setup()

    expect(history.onChange(details("Hello!"), true)).toBe(true)
    expect(history.onChange(details("Hello!!"), true)).toBe(true)
    expect(store.getState().past).toHaveLength(1)
    // the entry holds the canvas as it was before the edit
    expect(store.getState().past[0].nodes[0].data).toEqual({
      details: details("Hello"),
    })

    history.release()
    expect(history.onChange(details("Hello!!!"), true)).toBe(true)
    expect(store.getState().past).toHaveLength(2)
  })
})
