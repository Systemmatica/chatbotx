/**
 * Text logo for self-hosted instances that set PLATFORM_BRAND_NAME but have no
 * logo image: the builder serves these SVGs from /api/brand/*.svg and the
 * default tenant settings point the logo/favicon URLs at them.
 */
const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

export type WordmarkTheme = "light" | "dark"

// light = for dark backgrounds (white text), dark = for light backgrounds.
const fill = (theme: WordmarkTheme) =>
  theme === "light" ? "#ffffff" : "#111827"

export function renderWordmarkSvg(name: string, theme: WordmarkTheme): string {
  const text = escapeXml(name.trim())
  // Rough advance width for a 600-weight sans at 28px; the viewBox only needs
  // to be wide enough, the image is scaled to h-8 by the sidebar.
  const width = Math.max(40, Math.ceil([...name.trim()].length * 16.5) + 8)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="40" viewBox="0 0 ${width} 40"><text x="4" y="29" font-family="Inter, Segoe UI, Roboto, Arial, sans-serif" font-size="28" font-weight="600" fill="${fill(theme)}">${text}</text></svg>`
}

export function renderMonogramSvg(name: string, theme: WordmarkTheme): string {
  const letter = escapeXml(([...name.trim()][0] ?? "?").toUpperCase())
  const bg = theme === "light" ? "#ffffff" : "#111827"
  const fg = theme === "light" ? "#111827" : "#ffffff"
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="44" text-anchor="middle" font-family="Inter, Segoe UI, Roboto, Arial, sans-serif" font-size="36" font-weight="700" fill="${fg}">${letter}</text></svg>`
}

export const configuredBrandName = (): string | null =>
  process.env.PLATFORM_BRAND_NAME?.trim() || null
