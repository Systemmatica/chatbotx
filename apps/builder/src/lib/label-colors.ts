import {
  type LabelColor,
  labelColors,
  resolveLabelColor,
} from "@chatbotx.io/database/partials"

type LabelColorStyle = {
  /** Chip background + text classes (theme-aware via CSS variables). */
  chip: string
  /** Solid swatch / dot class. */
  dot: string
  /** Raw CSS values, for components that only accept inline styles. */
  background: string
  foreground: string
}

/**
 * Token -> classes. Spelled out literally (no string building) so Tailwind's
 * source scanner emits every class; the variables live in `app/globals.css`
 * with light and dark values.
 */
export const LABEL_COLOR_STYLES = {
  default: {
    chip: "bg-(--label-default-bg) text-(--label-default-fg)",
    dot: "bg-(--label-default-fg)",
    background: "var(--label-default-bg)",
    foreground: "var(--label-default-fg)",
  },
  gray: {
    chip: "bg-(--label-gray-bg) text-(--label-gray-fg)",
    dot: "bg-(--label-gray-fg)",
    background: "var(--label-gray-bg)",
    foreground: "var(--label-gray-fg)",
  },
  brown: {
    chip: "bg-(--label-brown-bg) text-(--label-brown-fg)",
    dot: "bg-(--label-brown-fg)",
    background: "var(--label-brown-bg)",
    foreground: "var(--label-brown-fg)",
  },
  orange: {
    chip: "bg-(--label-orange-bg) text-(--label-orange-fg)",
    dot: "bg-(--label-orange-fg)",
    background: "var(--label-orange-bg)",
    foreground: "var(--label-orange-fg)",
  },
  yellow: {
    chip: "bg-(--label-yellow-bg) text-(--label-yellow-fg)",
    dot: "bg-(--label-yellow-fg)",
    background: "var(--label-yellow-bg)",
    foreground: "var(--label-yellow-fg)",
  },
  green: {
    chip: "bg-(--label-green-bg) text-(--label-green-fg)",
    dot: "bg-(--label-green-fg)",
    background: "var(--label-green-bg)",
    foreground: "var(--label-green-fg)",
  },
  blue: {
    chip: "bg-(--label-blue-bg) text-(--label-blue-fg)",
    dot: "bg-(--label-blue-fg)",
    background: "var(--label-blue-bg)",
    foreground: "var(--label-blue-fg)",
  },
  purple: {
    chip: "bg-(--label-purple-bg) text-(--label-purple-fg)",
    dot: "bg-(--label-purple-fg)",
    background: "var(--label-purple-bg)",
    foreground: "var(--label-purple-fg)",
  },
  pink: {
    chip: "bg-(--label-pink-bg) text-(--label-pink-fg)",
    dot: "bg-(--label-pink-fg)",
    background: "var(--label-pink-bg)",
    foreground: "var(--label-pink-fg)",
  },
  red: {
    chip: "bg-(--label-red-bg) text-(--label-red-fg)",
    dot: "bg-(--label-red-fg)",
    background: "var(--label-red-bg)",
    foreground: "var(--label-red-fg)",
  },
} as const satisfies Record<LabelColor, LabelColorStyle>

/** Styles for a stored color; unknown/null falls back to `name`'s color. */
export const getLabelColorStyle = (
  color: string | null | undefined,
  name = "",
): LabelColorStyle => LABEL_COLOR_STYLES[resolveLabelColor(color, name)]

export const LABEL_COLOR_OPTIONS = labelColors.options

/** i18n key of a palette token's display name. */
export const labelColorTranslationKey = (color: LabelColor) =>
  `labelColors.${color}` as const
