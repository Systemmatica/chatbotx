import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { useCallback, useMemo } from "react"
import { getLabelColorStyle } from "@/lib/label-colors"
import { useTagStore } from "./tag-store-context"

export const useTagOptions = (): string[] => {
  const tags = useTagStore((state) => state.tags)

  return useMemo(() => tags.map((tag) => tag.name), [tags])
}

/**
 * Chip classes for a tag name, for inputs that only know names (e.g.
 * `TagsInputField`). Unknown names (typed but not yet created) still get
 * their deterministic color, matching what the server will assign.
 */
export const useTagChipClassName = (): ((name: string) => string) => {
  const tags = useTagStore((state) => state.tags)
  const colorByName = useMemo(
    () => new Map(tags.map((tag) => [tag.name, tag.color] as const)),
    [tags],
  )

  return useCallback(
    (name: string) => getLabelColorStyle(colorByName.get(name), name).chip,
    [colorByName],
  )
}

export const useTagSelectOptions = ({
  prefix,
}: {
  prefix?: string
} = {}): SelectOption[] => {
  const tags = useTagStore((state) => state.tags)

  return useMemo(
    () =>
      tags.map((tag) => {
        const style = getLabelColorStyle(tag.color, tag.name)
        return {
          label: tag.name,
          value: prefix ? `${prefix}:${tag.id}` : tag.id,
          style: {
            badgeColor: style.background,
            iconColor: style.foreground,
          },
        }
      }),
    [tags, prefix],
  )
}
