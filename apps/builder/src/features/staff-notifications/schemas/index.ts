import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

// Mirrors `MAX_STUCK_CONTACT_NOTIFY_HOURS` / `STUCK_CONTACT_NOTIFY_HOUR_OPTIONS`
// in @chatbotx.io/business (kept local so client components never pull the
// server-side business barrel into the browser bundle).
export const MAX_STUCK_CONTACT_NOTIFY_HOURS = 24 * 30
export const STUCK_CONTACT_NOTIFY_HOUR_OPTIONS = [
  0, 1, 3, 6, 12, 24, 48, 72, 168,
] as const

export const staffNotificationTypesSchema = z.object({
  newMessageToHuman: z.boolean(),
  notifyAdmin: z.boolean(),
  contactStuck: z.boolean(),
})
export type StaffNotificationTypesResource = z.infer<
  typeof staffNotificationTypesSchema
>

export const staffNotificationSettingsResource = z.object({
  available: z.boolean(),
  connected: z.boolean(),
  types: staffNotificationTypesSchema,
  stuckContactNotifyHours: z.number().int(),
  /** The current member may change workspace-wide settings (threshold). */
  canManageWorkspace: z.boolean(),
})
export type StaffNotificationSettingsResource = z.infer<
  typeof staffNotificationSettingsResource
>

export const updateStaffNotificationTypesRequest = withWorkspaceIdSchema.extend(
  {
    types: staffNotificationTypesSchema.partial(),
  },
)

export const updateStuckThresholdRequest = withWorkspaceIdSchema.extend({
  hours: z.number().int().min(0).max(MAX_STUCK_CONTACT_NOTIFY_HOURS),
})

export const staffTelegramLinkResource = z.object({
  url: z.url(),
  expiresAt: z.date(),
})
