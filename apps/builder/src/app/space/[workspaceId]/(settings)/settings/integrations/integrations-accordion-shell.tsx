"use client"

import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { RouteAccordionShell } from "@/components/route-accordion-shell"
import { INTEGRATION_SETTINGS_REGISTRY } from "@/features/integrations/settings-registry"

type IntegrationsAccordionShellProps = {
  readonly children?: ReactNode
  /** HIDDEN_FEATURES ids; a provider is hidden by `integration-<slug>`. */
  readonly hiddenFeatures?: readonly string[]
}

/** Integrations settings list — see `RouteAccordionShell` for navigation shape. */
export function IntegrationsAccordionShell({
  children,
  hiddenFeatures = [],
}: IntegrationsAccordionShellProps) {
  const t = useTranslations()
  const params = useParams<{ workspaceId: string }>()

  return (
    <RouteAccordionShell
      basePath={`/space/${params.workspaceId}/settings/integrations`}
      items={INTEGRATION_SETTINGS_REGISTRY.filter(
        (integration) =>
          !hiddenFeatures.includes(`integration-${integration.slug}`),
      ).map((integration) => ({
        value: integration.slug,
        label: (
          <div className="flex items-center gap-2">
            <integration.icon size={24} />
            {t(integration.titleKey as Parameters<typeof t>[0])}
          </div>
        ),
      }))}
    >
      {children}
    </RouteAccordionShell>
  )
}
