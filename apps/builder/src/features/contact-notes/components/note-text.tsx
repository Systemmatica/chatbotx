import { parseMentionSegments } from "@chatbotx.io/utils/mentions"

export function MentionChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded bg-primary/10 px-1 font-medium text-primary">
      @{name}
    </span>
  )
}

/** Note text with `@[Name](userId)` mentions rendered as chips. */
export function NoteText({ text }: { text: string }) {
  const segments = parseMentionSegments(text)
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "mention" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and re-derived from the text
          <MentionChip key={`m-${index}`} name={segment.name} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and re-derived from the text
          <span key={`t-${index}`}>{segment.text}</span>
        ),
      )}
    </>
  )
}
