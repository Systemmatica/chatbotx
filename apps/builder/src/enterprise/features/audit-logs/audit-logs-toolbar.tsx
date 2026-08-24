"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useMemo, useState } from "react"
import type { AuditLogAdminOption } from "./queries"
import type { ListAuditLogsRequest } from "./schemas/query"

type AuditLogsToolbarProps = Pick<
  ListAuditLogsRequest,
  "from" | "to" | "keyword" | "userId"
> & {
  admins: AuditLogAdminOption[]
}

const ALL_ADMINS_VALUE = "__all_admins"

export function AuditLogsToolbar({
  from,
  to,
  keyword,
  userId,
  admins,
}: AuditLogsToolbarProps) {
  const t = useTranslations()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [draft, setDraft] = useState({ from, to, keyword, userId })
  const adminOptions = useMemo(
    () => [
      { label: t("auditLogs.filters.allAdmins"), value: ALL_ADMINS_VALUE },
      ...admins.map((admin) => ({ label: admin.label, value: admin.id })),
    ],
    [admins, t],
  )

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const params = new URLSearchParams(searchParams)
    params.set("page", "1")

    for (const key of ["from", "to", "keyword", "userId"] as const) {
      const value = draft[key].trim()
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }

    router.push(`${pathname}?${params.toString()}`)
  }

  const resetFilters = () => {
    const params = new URLSearchParams(searchParams)
    for (const key of ["from", "to", "keyword", "userId", "page"] as const) {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <form
      className="flex flex-wrap items-end justify-end gap-2"
      onSubmit={applyFilters}
    >
      <label
        className="flex flex-col gap-1 text-muted-foreground text-xs"
        htmlFor="audit-log-from"
      >
        {t("auditLogs.filters.from")}
        <Input
          className="h-8 w-36"
          id="audit-log-from"
          onChange={(event) =>
            setDraft((current) => ({ ...current, from: event.target.value }))
          }
          type="date"
          value={draft.from}
        />
      </label>
      <label
        className="flex flex-col gap-1 text-muted-foreground text-xs"
        htmlFor="audit-log-to"
      >
        {t("auditLogs.filters.to")}
        <Input
          className="h-8 w-36"
          id="audit-log-to"
          onChange={(event) =>
            setDraft((current) => ({ ...current, to: event.target.value }))
          }
          type="date"
          value={draft.to}
        />
      </label>
      <label
        className="flex flex-col gap-1 text-muted-foreground text-xs"
        htmlFor="audit-log-user"
      >
        {t("auditLogs.filters.user")}
        <Select
          items={adminOptions}
          onValueChange={(value) => {
            const nextUserId = String(value)
            setDraft((current) => ({
              ...current,
              userId: nextUserId === ALL_ADMINS_VALUE ? "" : nextUserId,
            }))
          }}
          value={draft.userId || ALL_ADMINS_VALUE}
        >
          <SelectTrigger className="h-8 w-44" id="audit-log-user">
            <SelectValue placeholder={t("auditLogs.filters.allAdmins")} />
          </SelectTrigger>
          <SelectContent>
            {adminOptions.map((admin) => (
              <SelectItem key={admin.value} value={admin.value}>
                {admin.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label
        className="flex flex-col gap-1 text-muted-foreground text-xs"
        htmlFor="audit-log-keyword"
      >
        {t("auditLogs.filters.keyword")}
        <Input
          className="h-8 w-44"
          id="audit-log-keyword"
          onChange={(event) =>
            setDraft((current) => ({ ...current, keyword: event.target.value }))
          }
          placeholder={t("auditLogs.filters.keywordPlaceholder")}
          value={draft.keyword}
        />
      </label>
      <Button size="sm" type="submit">
        {t("actions.filter")}
      </Button>
      <Button onClick={resetFilters} size="sm" type="button" variant="outline">
        {t("actions.reset")}
      </Button>
    </form>
  )
}
