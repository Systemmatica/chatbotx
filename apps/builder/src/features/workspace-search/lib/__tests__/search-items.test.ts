import { describe, expect, test } from "vitest"
import {
  contactHref,
  flowNodeHref,
  MAX_RECENT_SEARCH_ITEMS,
  parseRecentSearchItems,
  pushRecentSearchItem,
  type SearchItem,
  toSearchItems,
} from "../search-items"

const item = (id: string, kind: SearchItem["kind"] = "flow"): SearchItem => ({
  kind,
  id,
  label: `Item ${id}`,
  href: `/space/1/flows/${id}`,
})

const contact = {
  id: "7",
  name: "Иван Петров",
  phoneNumber: "+79991234567",
  username: "ivan",
  avatar: null,
  conversationId: null,
}

describe("hrefs", () => {
  test("flow step opens the canvas focused on the node", () => {
    expect(flowNodeHref("1", "2", "node a")).toBe(
      "/space/1/flows/2?node=node%20a",
    )
  })

  test("contact opens its chat when it has one", () => {
    expect(contactHref("1", { ...contact, conversationId: "9" })).toBe(
      "/space/1/inbox?conversationId=9",
    )
  })

  test("contact without a chat opens the filtered contacts list", () => {
    expect(contactHref("1", contact)).toBe(
      `/space/1/contacts?keyword=${encodeURIComponent("Иван Петров")}`,
    )
  })
})

describe("toSearchItems", () => {
  test("maps every group with labels and links", () => {
    const items = toSearchItems(
      "1",
      {
        contacts: [{ ...contact, name: null }],
        flows: [{ id: "2", name: "Продажи" }],
        flowNodes: [
          { flowId: "2", flowName: "Продажи", nodeId: "n1", nodeName: "Оффер" },
        ],
        leadMagnets: [{ id: "3", name: "Чек-лист" }],
      },
      { unnamedContact: "No name" },
    )
    expect(items.contacts[0]).toMatchObject({
      label: "ivan",
      sublabel: "@ivan · +79991234567",
    })
    expect(items.flows[0]?.href).toBe("/space/1/flows/2")
    expect(items.flowNodes[0]).toMatchObject({
      id: "2:n1",
      sublabel: "Продажи",
      href: "/space/1/flows/2?node=n1",
    })
    expect(items.leadMagnets[0]?.href).toBe("/space/1/lead-magnets")
  })
})

describe("recent items", () => {
  test("puts the latest first without duplicates and caps the list", () => {
    let list: SearchItem[] = []
    for (let i = 0; i < MAX_RECENT_SEARCH_ITEMS + 2; i++) {
      list = pushRecentSearchItem(list, item(String(i)))
    }
    list = pushRecentSearchItem(list, item("3"))
    expect(list).toHaveLength(MAX_RECENT_SEARCH_ITEMS)
    expect(list[0]?.id).toBe("3")
    expect(list.filter((entry) => entry.id === "3")).toHaveLength(1)
  })

  test("same id of another kind is a different item", () => {
    const list = pushRecentSearchItem([item("1", "flow")], item("1", "contact"))
    expect(list).toHaveLength(2)
  })

  test("parsing drops malformed and foreign entries", () => {
    const raw = JSON.stringify([
      item("1"),
      { kind: "unknown", id: "2", label: "x", href: "/x" },
      { ...item("3"), href: "https://evil.example" },
      "garbage",
    ])
    expect(parseRecentSearchItems(raw).map((entry) => entry.id)).toEqual(["1"])
    expect(parseRecentSearchItems("{not json")).toEqual([])
    expect(parseRecentSearchItems(null)).toEqual([])
  })
})
