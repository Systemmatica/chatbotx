"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useSidebar } from "@chatbotx.io/ui/components/ui/sidebar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { MenuIcon } from "lucide-react"
import { useTranslations } from "next-intl"

/**
 * Hamburger that collapses the sidebar to icons and expands it back (on
 * mobile it opens/closes the sidebar sheet).
 */
export function SidebarToggleButton({ className }: { className?: string }) {
  const t = useTranslations()
  const { toggleSidebar, state, isMobile, openMobile } = useSidebar()
  const label = t("actions.toggleSidebar")

  return (
    <Button
      aria-expanded={isMobile ? openMobile : state === "expanded"}
      aria-label={label}
      className={cn("size-8 shrink-0", className)}
      data-sidebar="trigger"
      onClick={toggleSidebar}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      <MenuIcon className="size-5" />
    </Button>
  )
}
