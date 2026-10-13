import { z } from "zod"

/**
 * Notion-style label palette shared by tags and select/multi-select custom
 * field options. The DB stores the token name (never a hex value) so the UI
 * can map each token to theme-aware colors (light + dark) in one place.
 */
export const labelColors = z.enum([
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
])
export type LabelColor = z.infer<typeof labelColors>

/**
 * Colors eligible for automatic assignment. `default` is excluded so a freshly
 * created label is never rendered as a neutral grey chip.
 */
export const AUTO_LABEL_COLORS = labelColors.options.filter(
  (color) => color !== "default",
) as readonly Exclude<LabelColor, "default">[]

const HASH_MODULUS = 2_147_483_647 // 2^31 - 1, keeps every step a safe integer

/**
 * Polynomial string hash over the UTF-16 code units — tiny, dependency-free
 * and stable across runtimes (server, worker, browser), which is all a color
 * pick needs.
 */
const hashName = (input: string): number => {
  let hash = 7
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % HASH_MODULUS
  }
  return hash
}

/**
 * Deterministic color for a label name: the same name always maps to the same
 * color (case- and surrounding-whitespace-insensitive), so tags created by
 * flows/imports without an explicit color still render consistently.
 */
export const labelColorForName = (name: string): LabelColor => {
  const key = name.trim().toLowerCase()
  return AUTO_LABEL_COLORS[hashName(key) % AUTO_LABEL_COLORS.length]
}

/** Stored color when valid, otherwise the deterministic color of `name`. */
export const resolveLabelColor = (
  color: string | null | undefined,
  name: string,
): LabelColor => {
  const parsed = labelColors.safeParse(color)
  return parsed.success ? parsed.data : labelColorForName(name)
}
