import z from "zod"
import type { SearchWorkspaceResponse } from "../schemas"

/** Kinds of things the quick search can open. */
export const searchItemKinds = [
  "nav",
  "contact",
  "flow",
  "flowNode",
  "leadMagnet",
] as const
export type SearchItemKind = (typeof searchItemKinds)[number]

const SPACE_HREF_REGEX = /^\/space\/[^/]/

/** One selectable palette row; also what "recent" remembers. */
export const searchItemSchema = z.object({
  kind: z.enum(searchItemKinds),
  id: z.string().min(1),
  label: z.string(),
  sublabel: z.string().optional(),
  // Only in-app workspace links: recents are read back from localStorage.
  href: z.string().regex(SPACE_HREF_REGEX),
})
export type SearchItem = z.infer<typeof searchItemSchema>

export const MAX_RECENT_SEARCH_ITEMS = 6

export const searchItemKey = (item: Pick<SearchItem, "kind" | "id">) =>
  `${item.kind}:${item.id}`

const workspaceBase = (workspaceId: string) => `/space/${workspaceId}`

/** Opens the flow canvas with that step selected and centered. */
export const flowNodeHref = (
  workspaceId: string,
  flowId: string,
  nodeId: string,
) =>
  `${workspaceBase(workspaceId)}/flows/${flowId}?node=${encodeURIComponent(nodeId)}`

type ContactHit = SearchWorkspaceResponse["contacts"][number]

/**
 * A contact opens its chat in the inbox; a contact without a conversation
 * falls back to the contacts list filtered by its name/phone/username.
 */
export const contactHref = (workspaceId: string, contact: ContactHit) => {
  if (contact.conversationId) {
    return `${workspaceBase(workspaceId)}/inbox?conversationId=${encodeURIComponent(contact.conversationId)}`
  }
  const keyword = contact.name ?? contact.phoneNumber ?? contact.username ?? ""
  return `${workspaceBase(workspaceId)}/contacts?keyword=${encodeURIComponent(keyword)}`
}

/** Flattens the grouped API response into palette rows. */
export const toSearchItems = (
  workspaceId: string,
  result: SearchWorkspaceResponse,
  labels: { unnamedContact: string },
) => ({
  contacts: result.contacts.map(
    (contact): SearchItem => ({
      kind: "contact",
      id: contact.id,
      label: contact.name ?? contact.username ?? labels.unnamedContact,
      sublabel:
        [contact.username ? `@${contact.username}` : null, contact.phoneNumber]
          .filter(Boolean)
          .join(" · ") || undefined,
      href: contactHref(workspaceId, contact),
    }),
  ),
  flows: result.flows.map(
    (flow): SearchItem => ({
      kind: "flow",
      id: flow.id,
      label: flow.name,
      href: `${workspaceBase(workspaceId)}/flows/${flow.id}`,
    }),
  ),
  flowNodes: result.flowNodes.map(
    (node): SearchItem => ({
      kind: "flowNode",
      id: `${node.flowId}:${node.nodeId}`,
      label: node.nodeName,
      sublabel: node.flowName,
      href: flowNodeHref(workspaceId, node.flowId, node.nodeId),
    }),
  ),
  leadMagnets: result.leadMagnets.map(
    (leadMagnet): SearchItem => ({
      kind: "leadMagnet",
      id: leadMagnet.id,
      label: leadMagnet.name,
      href: `${workspaceBase(workspaceId)}/lead-magnets`,
    }),
  ),
})

/** Most recent first, without duplicates, capped. */
export const pushRecentSearchItem = (
  items: readonly SearchItem[],
  item: SearchItem,
  max: number = MAX_RECENT_SEARCH_ITEMS,
): SearchItem[] =>
  [
    item,
    ...items.filter((other) => searchItemKey(other) !== searchItemKey(item)),
  ].slice(0, Math.max(0, max))

/** Parses stored recents, dropping anything malformed (or from another app version). */
export const parseRecentSearchItems = (raw: string | null): SearchItem[] => {
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((entry) => searchItemSchema.safeParse(entry))
      .filter((entry) => entry.success)
      .map((entry) => entry.data)
      .slice(0, MAX_RECENT_SEARCH_ITEMS)
  } catch {
    return []
  }
}

export const recentSearchItemsStorageKey = (workspaceId: string) =>
  `quick-search:recent:${workspaceId}`
