"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { MagnetIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { leadMagnetHref } from "../lib/lead-magnets"
import type { ReceivedLeadMagnetResource } from "../schemas/resource"

/**
 * Lead magnets the contact received, newest first (the API orders them).
 * Hidden when there are none so workspaces without lead magnets see nothing.
 */
export function ContactLeadMagnets({
  leadMagnets,
}: {
  leadMagnets: ReceivedLeadMagnetResource[]
}) {
  const t = useTranslations()
  const formatter = useFormatter()

  if (leadMagnets.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2 border-t px-2 pt-2">
      <div className="flex items-center gap-2 font-medium text-sm">
        <MagnetIcon className="size-4 text-muted-foreground" />
        {t("leadMagnets.title")}
      </div>
      <div className="flex flex-wrap gap-1">
        {leadMagnets.map((leadMagnet) => {
          const values = {
            kind: t(`leadMagnets.kinds.${leadMagnet.kind}`),
            name: leadMagnet.name,
          }
          const label = leadMagnet.receivedAt
            ? t("leadMagnets.received.badge", {
                ...values,
                date: formatter.dateTime(new Date(leadMagnet.receivedAt), {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }),
              })
            : t("leadMagnets.received.badgeNoDate", values)
          const title = leadMagnet.receivedAt
            ? label
            : `${label} (${t("leadMagnets.received.unknownDate")})`
          const href = leadMagnetHref(leadMagnet.url)

          const badge = (
            <Badge
              className="max-w-full"
              key={leadMagnet.id}
              title={title}
              variant="secondary"
            >
              <span className="truncate">{label}</span>
            </Badge>
          )

          return href ? (
            <a
              className="max-w-full hover:opacity-80"
              href={href}
              key={leadMagnet.id}
              rel="noopener noreferrer"
              target="_blank"
            >
              {badge}
            </a>
          ) : (
            <span className="max-w-full" key={leadMagnet.id}>
              {badge}
            </span>
          )
        })}
      </div>
    </div>
  )
}
