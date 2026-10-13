import { describe, expect, it } from "vitest"
import {
  contactViewConfigInputSchema,
  resolveContactViewConfig,
} from "../../schemas/config"
import {
  DEFAULT_CONTACT_SORT,
  isViewStateDirty,
  moveViewId,
  toSavedViewConfig,
  toTableViewState,
} from "../view-state"

const tagFilter = {
  operator: "and" as const,
  conditions: [
    {
      field: "tags" as const,
      operator: "in" as const,
      value: ["1"],
    },
  ],
}

describe("contactViewConfigInputSchema", () => {
  it("accepts a full view config", () => {
    const parsed = contactViewConfigInputSchema.safeParse({
      sort: [{ id: "createdAt", desc: false }],
      visibleColumns: ["source", "cf:12"],
      groupBy: { kind: "customField", customFieldId: "12" },
    })
    expect(parsed.success).toBe(true)
  })

  it("accepts each grouping kind and rejects unknown ones", () => {
    for (const groupBy of [
      { kind: "leadMagnet" },
      { kind: "stage", boardId: "7" },
      null,
    ]) {
      expect(contactViewConfigInputSchema.safeParse({ groupBy }).success).toBe(
        true,
      )
    }
    expect(
      contactViewConfigInputSchema.safeParse({ groupBy: { kind: "tag" } })
        .success,
    ).toBe(false)
    expect(
      contactViewConfigInputSchema.safeParse({
        groupBy: { kind: "customField", customFieldId: "abc" },
      }).success,
    ).toBe(false)
  })

  it("rejects a malformed filter or sort", () => {
    expect(
      contactViewConfigInputSchema.safeParse({ filter: { foo: 1 } }).success,
    ).toBe(false)
    expect(
      contactViewConfigInputSchema.safeParse({ sort: [{ id: "createdAt" }] })
        .success,
    ).toBe(false)
  })
})

describe("resolveContactViewConfig", () => {
  it("falls back per part instead of dropping the whole view", () => {
    const resolved = resolveContactViewConfig({
      filter: { broken: true },
      sort: [{ id: "fullName", desc: false }],
      visibleColumns: "nope",
      groupBy: { kind: "leadMagnet" },
    })
    expect(resolved).toEqual({
      filter: null,
      sort: [{ id: "fullName", desc: false }],
      visibleColumns: null,
      groupBy: { kind: "leadMagnet" },
    })
  })

  it("reads garbage as the defaults", () => {
    expect(resolveContactViewConfig(null)).toEqual({
      filter: null,
      sort: [],
      visibleColumns: null,
      groupBy: null,
    })
  })
})

describe("view table state", () => {
  it('"All" is the table defaults', () => {
    const state = toTableViewState(null)
    expect(state.sort).toEqual(DEFAULT_CONTACT_SORT)
    expect(state.filter.conditions).toEqual([])
    expect(state.groupBy).toBeNull()
    expect(state.visibleColumns).toContain("createdAt")
  })

  it("is clean right after applying a view and dirty after a change", () => {
    const saved = toTableViewState(
      resolveContactViewConfig({ groupBy: { kind: "leadMagnet" } }),
    )
    expect(isViewStateDirty(saved, { ...saved })).toBe(false)
    expect(isViewStateDirty(saved, { ...saved, groupBy: null })).toBe(true)
    expect(
      isViewStateDirty(saved, {
        ...saved,
        sort: [{ id: "createdAt", desc: false }],
      }),
    ).toBe(true)
  })

  it("treats an empty filter group as no filter", () => {
    const all = toTableViewState(null)
    expect(
      isViewStateDirty(all, {
        ...all,
        filter: { operator: "or", conditions: [] },
      }),
    ).toBe(false)
  })

  it("round-trips through the saved config", () => {
    const state = {
      ...toTableViewState(null),
      filter: tagFilter,
      visibleColumns: ["source", "cf:3"],
    }
    const saved = toSavedViewConfig(state)
    expect(contactViewConfigInputSchema.safeParse(saved).success).toBe(true)
    const restored = toTableViewState(resolveContactViewConfig(saved))
    expect(isViewStateDirty(restored, state)).toBe(false)
  })

  it("does not store an empty filter", () => {
    expect(toSavedViewConfig(toTableViewState(null)).filter).toBeUndefined()
  })
})

describe("moveViewId", () => {
  const ids = ["a", "b", "c"]

  it("swaps a tab with its neighbour", () => {
    expect(moveViewId(ids, "b", "left")).toEqual(["b", "a", "c"])
    expect(moveViewId(ids, "b", "right")).toEqual(["a", "c", "b"])
  })

  it("returns the same array when the tab cannot move", () => {
    expect(moveViewId(ids, "a", "left")).toBe(ids)
    expect(moveViewId(ids, "c", "right")).toBe(ids)
    expect(moveViewId(ids, "z", "left")).toBe(ids)
  })
})
