import { z } from "zod"

/**
 * Contact history events that have no other stored trace. Everything else in
 * the contact's activity feed (contact created, notes, current tags, current
 * flow step...) is derived from existing tables at read time.
 */
export const contactActivityTypes = z.enum([
  "tagAdded",
  "tagRemoved",
  "customFieldChanged",
  "flowStarted",
  "assignmentChanged",
  "conversationClosed",
])
export type ContactActivityType = z.infer<typeof contactActivityTypes>

/** Who caused the change: a team member, the bot/automation, or a public API token. */
export const contactActivityActorTypes = z.enum(["user", "bot", "api"])
export type ContactActivityActorType = z.infer<typeof contactActivityActorTypes>

export type ContactActivityPayload = {
  tagId?: string
  customFieldId?: string
  customFieldName?: string
  oldValue?: unknown
  newValue?: unknown
  flowId?: string
  nodeId?: string
  conversationId?: string
  /** User or inbox team id; `null` when the conversation was unassigned. */
  assignedTo?: string | null
}
