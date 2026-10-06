import {
  workspaceMemberNotificationChannelsSchema,
  workspaceMemberNotificationTypesSchema,
  workspaceMemberPermissionsSchema,
} from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const workspaceMemberResource = createSelectSchema(
  workspaceMemberModel,
  {
    id: z.string(),
    userId: z.string(),
    workspaceId: z.string(),
  },
)
  // The member's private Telegram chat id never leaves the server.
  .omit({ telegramChatId: true })
  .extend({
    permissions: workspaceMemberPermissionsSchema,
    notificationTypes: workspaceMemberNotificationTypesSchema.partial(),
    notificationChannels: workspaceMemberNotificationChannelsSchema.partial(),
  })
export type WorkspaceMemberResource = z.infer<typeof workspaceMemberResource>
