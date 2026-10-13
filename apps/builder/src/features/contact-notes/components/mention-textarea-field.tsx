"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  findMentionQuery,
  insertMention,
  parseMentionSegments,
} from "@chatbotx.io/utils/mentions"
import { useTranslations } from "next-intl"
import {
  type KeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { client } from "@/lib/orpc/orpc"
import { MentionChip } from "./note-text"

type Member = { userId: string; name: string }

const MAX_SUGGESTIONS = 6
const MEMBERS_PAGE_SIZE = 200

/** Workspace members, fetched once per workspace on the first "@". */
function useWorkspaceMembers(workspaceId: string) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const requested = useRef<string | null>(null)

  const ensureLoaded = useCallback(() => {
    if (requested.current === workspaceId) {
      return
    }
    requested.current = workspaceId
    client.workspaceMembersAPI
      .listWorkspaceMembersAuthenticatedAPI({
        workspaceId,
        perPage: MEMBERS_PAGE_SIZE,
        keyword: null,
      })
      .then(({ data }) =>
        setMembers(
          data.map((member) => ({
            userId: member.user.id,
            name: member.user.name ?? member.user.id,
          })),
        ),
      )
      .catch(() => {
        requested.current = null
        setMembers([])
      })
  }, [workspaceId])

  return { members, ensureLoaded }
}

/**
 * Textarea for a react-hook-form field with "@" suggestions of workspace
 * members. A picked member is stored inline as `@[Name](userId)`; the
 * mentioned members are listed as chips under the field.
 */
export function MentionTextareaField<T extends FieldValues>({
  name,
  workspaceId,
  required,
}: {
  name: FieldPath<T>
  workspaceId: string
  required?: boolean
}) {
  return (
    <FormFieldWrapper name={name} required={required}>
      {(field) => (
        <MentionTextarea
          onBlur={field.onBlur}
          onChange={(value) => field.onChange(value as T[FieldPath<T>])}
          value={(field.value as string | undefined) ?? ""}
          workspaceId={workspaceId}
        />
      )}
    </FormFieldWrapper>
  )
}

function MentionTextarea({
  value,
  onChange,
  onBlur,
  workspaceId,
}: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  workspaceId: string
}) {
  const t = useTranslations()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<{ start: number; query: string } | null>(
    null,
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const { members, ensureLoaded } = useWorkspaceMembers(workspaceId)

  const suggestions = useMemo(() => {
    if (!(query && members)) {
      return []
    }
    const needle = query.query.trim().toLocaleLowerCase()
    return members
      .filter((member) => member.name.toLocaleLowerCase().includes(needle))
      .slice(0, MAX_SUGGESTIONS)
  }, [members, query])

  const mentioned = useMemo(() => {
    const byUser = new Map<string, string>()
    for (const segment of parseMentionSegments(value)) {
      if (segment.type === "mention" && !byUser.has(segment.userId)) {
        byUser.set(segment.userId, segment.name)
      }
    }
    return [...byUser].map(([userId, mentionName]) => ({
      userId,
      name: mentionName,
    }))
  }, [value])

  const syncQuery = (text: string, caret: number | null) => {
    const next = caret === null ? null : findMentionQuery(text, caret)
    if (next?.query !== query?.query) {
      setActiveIndex(0)
    }
    setQuery(next)
    if (next) {
      ensureLoaded()
    }
  }

  const pick = (member: Member) => {
    const textarea = textareaRef.current
    if (!(query && textarea)) {
      return
    }
    const result = insertMention({
      text: value,
      start: query.start,
      caret: textarea.selectionStart ?? value.length,
      name: member.name,
      userId: member.userId,
    })
    onChange(result.text)
    setQuery(null)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.caret, result.caret)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!query || suggestions.length === 0) {
      if (event.key === "Escape" && query) {
        setQuery(null)
      }
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      )
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      const member = suggestions[activeIndex]
      if (member) {
        pick(member)
      }
    } else if (event.key === "Escape") {
      event.preventDefault()
      setQuery(null)
    }
  }

  return (
    <div className="relative flex w-full flex-col gap-1">
      <Textarea
        aria-autocomplete="list"
        aria-expanded={Boolean(query) && suggestions.length > 0}
        onBlur={() => {
          setQuery(null)
          onBlur()
        }}
        onChange={(event) => {
          onChange(event.target.value)
          syncQuery(event.target.value, event.target.selectionStart)
        }}
        onClick={(event) =>
          syncQuery(
            event.currentTarget.value,
            event.currentTarget.selectionStart,
          )
        }
        onKeyDown={onKeyDown}
        placeholder={t("noteMentions.placeholder")}
        ref={textareaRef}
        value={value}
      />

      {query ? (
        <div
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground text-sm shadow-md"
          role="listbox"
        >
          {members === null ? (
            <div className="px-2 py-1 text-muted-foreground">
              {t("noteMentions.loading")}
            </div>
          ) : null}
          {members !== null && suggestions.length === 0 ? (
            <div className="px-2 py-1 text-muted-foreground">
              {t("noteMentions.noMatches")}
            </div>
          ) : null}
          {suggestions.map((member, index) => (
            <button
              aria-selected={index === activeIndex}
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1 text-left",
                index === activeIndex ? "bg-accent text-accent-foreground" : "",
              )}
              key={member.userId}
              // Keep focus (and the caret) in the textarea while picking.
              onMouseDown={(event) => {
                event.preventDefault()
                pick(member)
              }}
              role="option"
              type="button"
            >
              {member.name}
            </button>
          ))}
        </div>
      ) : null}

      {mentioned.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 text-muted-foreground text-xs">
          <span>{t("noteMentions.mentioned")}</span>
          {mentioned.map((mention) => (
            <MentionChip key={mention.userId} name={mention.name} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
