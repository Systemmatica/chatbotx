"use client"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useCommandPaletteStore } from "../lib/command-palette-store"

const APPLE_PLATFORM_REGEX = /mac|iphone|ipad|ipod/i

/** "⌘K" on Apple devices, "Ctrl K" elsewhere (decided after mount to avoid a hydration mismatch). */
function useShortcutLabel() {
  const [label, setLabel] = useState("Ctrl K")
  useEffect(() => {
    if (APPLE_PLATFORM_REGEX.test(navigator.userAgent)) {
      setLabel("⌘K")
    }
  }, [])
  return label
}

/** Sidebar entry point of the quick search. */
export function SidebarSearchTrigger() {
  const t = useTranslations()
  const setOpen = useCommandPaletteStore((state) => state.setOpen)
  const shortcut = useShortcutLabel()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="h-9 cursor-pointer text-muted-foreground"
          onClick={() => setOpen(true)}
          tooltip={`${t("globalSearch.open")} (${shortcut})`}
        >
          <SearchIcon className="size-5 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {t("globalSearch.open")}
          </span>
          <kbd className="ms-auto rounded border bg-muted px-1.5 font-mono text-[10px] group-data-[collapsible=icon]:hidden">
            {shortcut}
          </kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
