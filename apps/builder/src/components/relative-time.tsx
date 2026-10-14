"use client"

import { useRelativeTime } from "@/hooks/use-relative-time"
import type { RelativeTimeInput } from "@/lib/relative-time"

/**
 * `<time>` with a self-updating relative label in the interface locale. The
 * server render and hydration happen seconds apart, so a differing label is
 * expected there and not reported as a hydration mismatch.
 */
export function RelativeTime({
  value,
  className,
  title,
}: {
  value: RelativeTimeInput
  className?: string
  title?: string
}) {
  const label = useRelativeTime(value)
  const date = new Date(value)

  return (
    <time
      className={className}
      dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}
      suppressHydrationWarning
      title={title}
    >
      {label}
    </time>
  )
}
