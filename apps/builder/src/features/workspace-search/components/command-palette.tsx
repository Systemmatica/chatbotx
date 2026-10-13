"use client"

import {
  MATCH_SCORE,
  scoreSearchMatch,
} from "@chatbotx.io/business/workspace-search/matching"
import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  ClockIcon,
  CompassIcon,
  LoaderCircleIcon,
  type LucideIcon,
  MagnetIcon,
  MessageCircleMoreIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  UserIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { useDebounce } from "use-debounce"
import {
  hasContactsAccess,
  hasWorkspacePermission,
  PERMISSION_NAV,
} from "@/lib/auth/permission-routes"
import { client } from "@/lib/orpc/orpc"
import { useCommandPaletteStore } from "../lib/command-palette-store"
import {
  type SearchItem,
  type SearchItemKind,
  searchItemKey,
  toSearchItems,
} from "../lib/search-items"
import { useRecentSearchItems } from "../lib/use-recent-search-items"

const SEARCH_DEBOUNCE_MS = 250

const iconByKind = {
  nav: CompassIcon,
  contact: UserIcon,
  flow: WorkflowIcon,
  flowNode: SquareIcon,
  leadMagnet: MagnetIcon,
} as const satisfies Record<SearchItemKind, LucideIcon>

type NavEntry = SearchItem & { icon: LucideIcon }

/** Static sections, filtered by the same permissions as the sidebar. */
function useNavEntries(
  workspaceId: string,
  permissions: WorkspaceMemberPermissions,
  hiddenFeatures: readonly string[],
): NavEntry[] {
  const t = useTranslations()

  return useMemo(() => {
    const base = `/space/${workspaceId}`
    const contactsAccess = hasContactsAccess(permissions)
    const entries: (NavEntry & { visible: boolean })[] = [
      {
        kind: "nav",
        id: "inbox",
        label: t("fields.inbox.label"),
        href: `${base}/inbox`,
        icon: MessageCircleMoreIcon,
        visible: contactsAccess,
      },
      {
        kind: "nav",
        id: "flows",
        label: t("fields.flows.label"),
        href: `${base}/flows`,
        icon: WorkflowIcon,
        visible: hasWorkspacePermission(permissions, PERMISSION_NAV.flows),
      },
      {
        kind: "nav",
        id: "contacts",
        label: t("fields.contacts.label"),
        href: `${base}/contacts`,
        icon: UsersIcon,
        visible: contactsAccess,
      },
      {
        kind: "nav",
        id: "lead-magnets",
        label: t("leadMagnets.title"),
        href: `${base}/lead-magnets`,
        icon: MagnetIcon,
        visible: contactsAccess,
      },
      {
        kind: "nav",
        id: "broadcasts",
        label: t("broadcasts.title"),
        href: `${base}/broadcasts`,
        icon: RadioIcon,
        visible: hasWorkspacePermission(permissions, PERMISSION_NAV.broadcasts),
      },
      {
        kind: "nav",
        id: "settings",
        label: t("settings.title"),
        href: `${base}/settings/general`,
        icon: SlidersHorizontalIcon,
        visible: hasWorkspacePermission(permissions, "superAdmin"),
      },
    ]
    return entries
      .filter((entry) => entry.visible && !hiddenFeatures.includes(entry.id))
      .map(({ visible: _visible, ...entry }) => entry)
  }, [hiddenFeatures, permissions, t, workspaceId])
}

function SearchResultItem({
  item,
  icon,
  onSelect,
}: {
  item: SearchItem
  icon?: LucideIcon
  onSelect: (item: SearchItem) => void
}) {
  const Icon = icon ?? iconByKind[item.kind]
  return (
    <CommandItem onSelect={() => onSelect(item)} value={searchItemKey(item)}>
      <Icon className="text-muted-foreground" />
      <span className="truncate">{item.label}</span>
      {item.sublabel && (
        <span className="ms-auto max-w-[45%] truncate text-muted-foreground text-xs">
          {item.sublabel}
        </span>
      )}
    </CommandItem>
  )
}

/**
 * Global quick search (⌘K / Ctrl+K): sections, contacts, flows, flow steps and
 * lead magnets of the current workspace. Empty query shows recently opened
 * results and the sections.
 */
export function WorkspaceCommandPalette({
  workspaceId,
  permissions,
  hiddenFeatures = [],
}: {
  workspaceId: string
  permissions: WorkspaceMemberPermissions
  hiddenFeatures?: string[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const open = useCommandPaletteStore((state) => state.open)
  const setOpen = useCommandPaletteStore((state) => state.setOpen)
  const toggle = useCommandPaletteStore((state) => state.toggle)
  const [query, setQuery] = useState("")
  const [debouncedQuery] = useDebounce(query.trim(), SEARCH_DEBOUNCE_MS)
  const navEntries = useNavEntries(workspaceId, permissions, hiddenFeatures)
  const recent = useRecentSearchItems(workspaceId)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault()
        toggle()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [toggle])

  const search = useSWR(
    open && debouncedQuery
      ? (["workspace-search", workspaceId, debouncedQuery] as const)
      : null,
    ([, id, q]) =>
      client.workspaceSearchAPI.searchWorkspaceAPI({
        workspaceId: id,
        query: q,
      }),
    { keepPreviousData: true, revalidateOnFocus: false },
  )

  const results = useMemo(
    () =>
      search.data && debouncedQuery
        ? toSearchItems(workspaceId, search.data, {
            unnamedContact: t("globalSearch.unnamedContact"),
          })
        : null,
    [debouncedQuery, search.data, t, workspaceId],
  )

  const trimmedQuery = query.trim()
  const matchingNav = useMemo(
    () =>
      trimmedQuery
        ? navEntries.filter(
            (entry) =>
              scoreSearchMatch(entry.label, trimmedQuery) < MATCH_SCORE.none,
          )
        : navEntries,
    [navEntries, trimmedQuery],
  )

  // Start from a clean palette every time, however it was closed (Esc,
  // outside click, Ctrl+K or picking a result).
  useEffect(() => {
    if (!open) {
      setQuery("")
    }
  }, [open])

  const handleSelect = useCallback(
    (item: SearchItem) => {
      recent.remember({
        kind: item.kind,
        id: item.id,
        label: item.label,
        sublabel: item.sublabel,
        href: item.href,
      })
      setOpen(false)
      router.push(item.href)
    },
    [recent, router, setOpen],
  )

  const isSearching =
    Boolean(trimmedQuery) &&
    (trimmedQuery !== debouncedQuery || search.isLoading)
  const hasResults =
    matchingNav.length > 0 ||
    Boolean(
      results &&
        (results.contacts.length ||
          results.flows.length ||
          results.flowNodes.length ||
          results.leadMagnets.length),
    )

  const groups: { key: keyof NonNullable<typeof results>; heading: string }[] =
    [
      { key: "flows", heading: t("globalSearch.groups.flows") },
      { key: "flowNodes", heading: t("globalSearch.groups.flowNodes") },
      { key: "contacts", heading: t("globalSearch.groups.contacts") },
      { key: "leadMagnets", heading: t("globalSearch.groups.leadMagnets") },
    ]

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent
        className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("globalSearch.title")}</DialogTitle>
          <DialogDescription>{t("globalSearch.description")}</DialogDescription>
        </DialogHeader>
        <Command
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2"
          loop
          shouldFilter={false}
        >
          <CommandInput
            onValueChange={setQuery}
            placeholder={t("globalSearch.placeholder")}
            value={query}
          />
          <CommandList className="max-h-[min(60vh,420px)]">
            {isSearching && !hasResults && (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                <LoaderCircleIcon className="size-4 animate-spin" />
                {t("globalSearch.searching")}
              </div>
            )}
            {!isSearching && trimmedQuery && (
              <CommandEmpty>{t("globalSearch.empty")}</CommandEmpty>
            )}

            {!trimmedQuery && recent.items.length > 0 && (
              <CommandGroup heading={t("globalSearch.groups.recent")}>
                {recent.items.map((item) => (
                  <SearchResultItem
                    icon={item.kind === "nav" ? ClockIcon : undefined}
                    item={item}
                    key={searchItemKey(item)}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            )}

            {matchingNav.length > 0 && (
              <CommandGroup heading={t("globalSearch.groups.navigation")}>
                {matchingNav.map((entry) => (
                  <SearchResultItem
                    icon={entry.icon}
                    item={entry}
                    key={searchItemKey(entry)}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            )}

            {results &&
              groups.map(({ key, heading }) =>
                results[key].length > 0 ? (
                  <CommandGroup heading={heading} key={key}>
                    {results[key].map((item) => (
                      <SearchResultItem
                        item={item}
                        key={searchItemKey(item)}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>
                ) : null,
              )}
          </CommandList>
          <div className="flex items-center gap-3 border-t px-3 py-2 text-muted-foreground text-xs">
            <span>{t("globalSearch.hintNavigate")}</span>
            <span>{t("globalSearch.hintOpen")}</span>
            <span>{t("globalSearch.hintClose")}</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
