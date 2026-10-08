/**
 * Contacts page pre-filtered to the holders of a lead magnet's tag, using the
 * `?contactFilter=<json>` round-trip the contacts table already reads.
 */
export function leadMagnetContactsHref(
  workspaceId: string,
  tagId: string,
): string {
  const filter = {
    operator: "and",
    conditions: [{ field: "tags", operator: "in", value: [tagId] }],
  }
  return `/space/${workspaceId}/contacts?contactFilter=${encodeURIComponent(
    JSON.stringify(filter),
  )}`
}

/** Server error code -> i18n key of a friendlier message. */
const errorKeys: Record<string, string> = {
  leadMagnetNameTaken: "leadMagnets.errors.nameTaken",
  leadMagnetTagNameTaken: "leadMagnets.errors.tagNameTaken",
  forbidden: "leadMagnets.errors.forbidden",
}

export function leadMagnetErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined
  const key = code ? errorKeys[code] : undefined
  if (key) {
    return t(key)
  }
  return error instanceof Error ? error.message : t("messages.unknownError")
}
