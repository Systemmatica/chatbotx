import { z } from "zod"

/**
 * Curated lucide icons (kebab-case names) a custom field can show instead of
 * its type icon. Stored in `CustomField.icon`; the components live in
 * `custom-field-icons.ts` so this list stays importable from request schemas.
 */
export const CUSTOM_FIELD_ICON_NAMES = [
  "text",
  "hash",
  "calendar-days",
  "calendar-clock",
  "clock",
  "check",
  "mail",
  "phone",
  "at-sign",
  "message-circle",
  "send",
  "link",
  "globe",
  "map-pin",
  "home",
  "building-2",
  "briefcase",
  "user",
  "users",
  "id-card",
  "fingerprint",
  "languages",
  "cake",
  "graduation-cap",
  "book-open",
  "file-text",
  "clipboard-list",
  "tag",
  "magnet",
  "gift",
  "shopping-cart",
  "package",
  "truck",
  "credit-card",
  "wallet",
  "banknote",
  "coins",
  "percent",
  "trending-up",
  "target",
  "flag",
  "star",
  "heart",
  "thumbs-up",
  "smile",
  "trophy",
  "sparkles",
  "zap",
  "lightbulb",
  "rocket",
  "handshake",
  "megaphone",
  "bell",
  "car",
  "plane",
  "stethoscope",
  "dumbbell",
  "utensils",
  "coffee",
  "camera",
] as const

export type CustomFieldIconName = (typeof CUSTOM_FIELD_ICON_NAMES)[number]

export const customFieldIconSchema = z.enum(CUSTOM_FIELD_ICON_NAMES)

export const isCustomFieldIconName = (
  value: unknown,
): value is CustomFieldIconName =>
  customFieldIconSchema.safeParse(value).success
