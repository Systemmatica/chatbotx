import { z } from "zod"

/** What a lead magnet is; only used to label and group them in the UI. */
export const leadMagnetKinds = z.enum([
  "book",
  "article",
  "template",
  "video",
  "checklist",
  "other",
])
export type LeadMagnetKind = z.infer<typeof leadMagnetKinds>

export const LEAD_MAGNET_NAME_MAX_LENGTH = 200
export const LEAD_MAGNET_URL_MAX_LENGTH = 2048
export const LEAD_MAGNET_DESCRIPTION_MAX_LENGTH = 2000

/** Prefix of the tag that marks "this contact received the lead magnet". */
export const LEAD_MAGNET_TAG_PREFIX = "ЛМ: "
/** Tag folder that collects every lead magnet tag. */
export const LEAD_MAGNET_TAG_FOLDER_NAME = "Лид-магниты"

export const leadMagnetTagName = (name: string): string =>
  `${LEAD_MAGNET_TAG_PREFIX}${name.trim()}`
