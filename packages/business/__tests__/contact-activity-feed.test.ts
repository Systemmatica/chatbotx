import { describe, expect, test } from "vitest"
import {
  type ContactActivityFeedItem,
  compareFeedItems,
  cursorToTableBefore,
  decodeFeedCursor,
  encodeFeedCursor,
  formatActivityValue,
  mergeFeedPage,
  tableEventKey,
} from "../src/contact-activity/feed"

const at = (iso: string) => new Date(iso)

const derivedItem = (id: string, iso: string): ContactActivityFeedItem => ({
  id,
  type: "tagAdded",
  occurredAt: at(iso),
  actor: null,
  details: {},
})

type Row = { id: string; createdAt: Date }

const tableItem = (row: Row): ContactActivityFeedItem => ({
  id: tableEventKey(row.id),
  type: "customFieldChanged",
  occurredAt: row.createdAt,
  actor: { type: "bot", userId: null, name: null },
  details: {},
})

/** In-memory twin of `contactActivityRepository.listByContact`'s SQL. */
function queryTable(
  rows: readonly Row[],
  before: ReturnType<typeof cursorToTableBefore>,
  limit: number,
): ContactActivityFeedItem[] {
  return rows
    .filter((row) => {
      if (!before) {
        return true
      }
      const t = row.createdAt.getTime()
      const b = before.createdAt.getTime()
      if (before.id) {
        return t < b || (t === b && BigInt(row.id) < BigInt(before.id))
      }
      return t <= b
    })
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (BigInt(b.id) > BigInt(a.id) ? 1 : -1),
    )
    .slice(0, limit)
    .map(tableItem)
}

function readAllPages(props: {
  derived: ContactActivityFeedItem[]
  rows: Row[]
  limit: number
}): { pages: ContactActivityFeedItem[][] } {
  const pages: ContactActivityFeedItem[][] = []
  let cursorValue: string | null = null
  for (let guard = 0; guard < 100; guard++) {
    const cursor = decodeFeedCursor(cursorValue)
    const page = mergeFeedPage({
      derived: props.derived,
      table: queryTable(
        props.rows,
        cursorToTableBefore(cursor),
        props.limit + 1,
      ),
      cursor,
      limit: props.limit,
    })
    pages.push(page.items)
    if (!page.nextCursor) {
      return { pages }
    }
    cursorValue = page.nextCursor
  }
  throw new Error("pagination did not terminate")
}

describe("contact activity feed ordering", () => {
  test("sorts newest first, then by key descending on ties", () => {
    const items = [
      derivedItem("tag:1", "2026-01-01T10:00:00.000Z"),
      derivedItem("note:5", "2026-01-02T10:00:00.000Z"),
      tableItem({ id: "9", createdAt: at("2026-01-01T10:00:00.000Z") }),
    ].sort(compareFeedItems)
    expect(items.map((item) => item.id)).toEqual([
      "note:5",
      "tag:1",
      tableEventKey("9"),
    ])
  })

  test("table keys order like numeric ids across digit lengths", () => {
    expect(tableEventKey("10") > tableEventKey("9")).toBe(true)
  })
})

describe("feed cursor", () => {
  test("round-trips through encode/decode", () => {
    const item = derivedItem("tag:42", "2026-03-04T05:06:07.890Z")
    expect(decodeFeedCursor(encodeFeedCursor(item))).toEqual({
      at: item.occurredAt.getTime(),
      key: "tag:42",
    })
  })

  test("decodes garbage to null instead of throwing", () => {
    expect(decodeFeedCursor("not a cursor!!")).toBeNull()
    expect(decodeFeedCursor(btoa(JSON.stringify({ at: "x" })))).toBeNull()
    expect(decodeFeedCursor(null)).toBeNull()
  })

  test("maps a table cursor to a (createdAt, id) bound without padding", () => {
    const before = cursorToTableBefore({
      at: 1000,
      key: tableEventKey("123"),
    })
    expect(before).toEqual({ createdAt: new Date(1000), id: "123" })
  })

  test("maps a derived cursor to an inclusive createdAt bound", () => {
    expect(cursorToTableBefore({ at: 1000, key: "note:1" })).toEqual({
      createdAt: new Date(1000),
    })
  })
})

describe("mergeFeedPage pagination", () => {
  const derived = [
    derivedItem("contact:1", "2026-01-01T00:00:00.000Z"),
    derivedItem("tag:7", "2026-01-03T00:00:00.000Z"),
    // Same instant as table rows below: derived sorts first.
    derivedItem("note:3", "2026-01-05T00:00:00.000Z"),
    derivedItem("step:f:n", "2026-01-09T00:00:00.000Z"),
  ]
  const rows: Row[] = [
    { id: "9", createdAt: at("2026-01-05T00:00:00.000Z") },
    { id: "10", createdAt: at("2026-01-05T00:00:00.000Z") },
    { id: "11", createdAt: at("2026-01-05T00:00:00.000Z") },
    { id: "12", createdAt: at("2026-01-02T00:00:00.000Z") },
    { id: "13", createdAt: at("2026-01-08T00:00:00.000Z") },
    { id: "14", createdAt: at("2026-01-04T00:00:00.000Z") },
  ]
  const expected = [...derived, ...rows.map(tableItem)]
    .sort(compareFeedItems)
    .map((item) => item.id)

  test.each([
    1, 2, 3, 4, 20,
  ])("page size %i returns every event exactly once, in order", (limit) => {
    const { pages } = readAllPages({ derived, rows, limit })
    const ids = pages.flat().map((item) => item.id)
    expect(ids).toEqual(expected)
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(limit)
    }
  })

  test("returns no cursor when everything fits on one page", () => {
    const page = mergeFeedPage({
      derived,
      table: queryTable(rows, undefined, 21),
      cursor: null,
      limit: 20,
    })
    expect(page.items).toHaveLength(10)
    expect(page.nextCursor).toBeNull()
  })

  test("drops duplicate keys", () => {
    const item = derivedItem("tag:1", "2026-01-01T00:00:00.000Z")
    const page = mergeFeedPage({
      derived: [item, item],
      table: [],
      cursor: null,
      limit: 10,
    })
    expect(page.items).toHaveLength(1)
  })

  test("empty feed", () => {
    expect(
      mergeFeedPage({ derived: [], table: [], cursor: null, limit: 5 }),
    ).toEqual({ items: [], nextCursor: null })
  })
})

describe("formatActivityValue", () => {
  test("renders empty values as null", () => {
    expect(formatActivityValue(null)).toBeNull()
    expect(formatActivityValue(undefined)).toBeNull()
    expect(formatActivityValue("")).toBeNull()
  })

  test("renders scalars, arrays and objects", () => {
    expect(formatActivityValue(42)).toBe("42")
    expect(formatActivityValue(false)).toBe("false")
    expect(formatActivityValue(["a", "b"])).toBe("a, b")
    expect(formatActivityValue({ a: 1 })).toBe('{"a":1}')
  })

  test("collapses whitespace and truncates long text", () => {
    expect(formatActivityValue("a \n  b")).toBe("a b")
    const long = formatActivityValue("x".repeat(500))
    expect(long).toHaveLength(120)
    expect(long?.endsWith("…")).toBe(true)
  })
})
