import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// Mirrors `contactActivityFeedTypes` in @chatbotx.io/business (kept local so
// client components never pull the server-side business barrel).
export const contactActivityItemTypes = z.enum([
  "contactCreated",
  "channelConnected",
  "tagAdded",
  "tagRemoved",
  "leadMagnetReceived",
  "customFieldChanged",
  "flowStarted",
  "stepReached",
  "noteAdded",
  "assignmentChanged",
  "conversationClosed",
])
export type ContactActivityItemType = z.infer<typeof contactActivityItemTypes>

export const CONTACT_ACTIVITY_PAGE_SIZE = 20

export const listContactActivityRequest = z.object({
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
  cursor: z.string().max(512).nullish(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})
export type ListContactActivityRequest = z.infer<
  typeof listContactActivityRequest
>

const nullableText = z.string().nullable().optional()

export const contactActivityItemResource = z.object({
  id: z.string(),
  type: contactActivityItemTypes,
  occurredAt: z.coerce.date(),
  actor: z
    .object({
      type: z.enum(["user", "bot", "api"]),
      userId: z.string().nullable(),
      name: z.string().nullable(),
    })
    .nullable(),
  details: z.object({
    channel: nullableText,
    source: nullableText,
    inboxName: nullableText,
    tagName: nullableText,
    leadMagnetName: nullableText,
    customFieldName: nullableText,
    oldValue: nullableText,
    newValue: nullableText,
    flowId: nullableText,
    flowName: nullableText,
    nodeType: nullableText,
    nodeName: nullableText,
    nodePreview: nullableText,
    assigneeName: nullableText,
    assigneeKind: z.enum(["user", "team"]).nullable().optional(),
    notePreview: nullableText,
  }),
})
export type ContactActivityItemResource = z.infer<
  typeof contactActivityItemResource
>

export const listContactActivityResponse = z.object({
  data: z.array(contactActivityItemResource),
  nextCursor: z.string().nullable(),
})
export type ListContactActivityResponse = z.infer<
  typeof listContactActivityResponse
>
