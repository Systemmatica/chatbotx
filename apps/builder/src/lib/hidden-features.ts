/**
 * Self-hosted instances can declutter the UI by listing feature ids in
 * HIDDEN_FEATURES (comma-separated, e.g. "ai-agents,coupons,minigames").
 * Ids match the sidebar `id` in `app-sidebar.tsx`, the tool `id` in
 * `features/tools/tools-list.tsx` and `integration-<slug>` for the providers
 * in `features/integrations/settings-registry.ts`. This only hides entry points; routes and
 * permissions are unchanged. Server-only: read it in a Server Component and
 * pass the result down as a prop.
 */
export const parseHiddenFeatures = (
  raw: string | undefined = process.env.HIDDEN_FEATURES,
): string[] =>
  (raw ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
