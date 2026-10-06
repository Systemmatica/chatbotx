import {
  staffNotificationService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  staffNotificationSettingsResource,
  staffNotificationTypesSchema,
  staffTelegramLinkResource,
  updateStaffNotificationTypesRequest,
  updateStuckThresholdRequest,
} from "../schemas"

const tags = ["StaffNotifications"]

const canManageWorkspace = async (workspaceId: string, userId: string) => {
  const member = await workspaceMemberService.findMembership({
    workspaceId,
    userId,
  })
  return member
    ? hasWorkspacePermission(member.permissions, "superAdmin")
    : false
}

/**
 * Every procedure acts on the CURRENT user's own membership (linking is
 * personal: it binds their Telegram chat), except the stuck threshold, which
 * is workspace-wide and needs super admin.
 */
export const staffNotificationsAuthenticatedAPI = {
  getStaffNotificationSettingsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/staff-notifications",
      summary: "Get my staff Telegram notification settings",
      tags,
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(staffNotificationSettingsResource)
    .handler(async ({ input, context }) => {
      const [settings, manage] = await Promise.all([
        staffNotificationService.getSettings({
          workspaceId: input.workspaceId,
          userId: context.user.id,
        }),
        canManageWorkspace(input.workspaceId, context.user.id),
      ])
      return { ...settings, canManageWorkspace: manage }
    }),

  createStaffTelegramLinkAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/staff-notifications/telegram-link",
      summary: "Create a one-time Telegram link for my notifications",
      tags,
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(staffTelegramLinkResource)
    .handler(async ({ input, context }) => {
      if (!staffNotificationService.isConfigured()) {
        throw new ChatbotXException(
          "Telegram notifications are not configured on this server",
          "notConfigured",
          400,
        )
      }
      return await staffNotificationService.createLinkUrl({
        workspaceId: input.workspaceId,
        userId: context.user.id,
      })
    }),

  disconnectStaffTelegramAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/staff-notifications/telegram-link",
      summary: "Disconnect my Telegram notifications",
      tags,
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
      await staffNotificationService.disconnect({
        workspaceId: input.workspaceId,
        userId: context.user.id,
      })
      return { success: true }
    }),

  updateStaffNotificationTypesAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/staff-notifications/types",
      summary: "Choose which staff notifications I receive",
      tags,
    })
    .input(updateStaffNotificationTypesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(staffNotificationTypesSchema)
    .handler(
      async ({ input, context }) =>
        await staffNotificationService.updateTypes({
          workspaceId: input.workspaceId,
          userId: context.user.id,
          types: input.types,
        }),
    ),

  updateStuckContactThresholdAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/staff-notifications/stuck-threshold",
      summary: "Set after how many hours a contact counts as stuck",
      tags,
    })
    .input(updateStuckThresholdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ hours: z.number().int() }))
    .handler(async ({ input, context }) => {
      if (!(await canManageWorkspace(input.workspaceId, context.user.id))) {
        throw new ChatbotXException(
          "Only workspace super admins can change this setting",
          "forbidden",
          403,
        )
      }
      const hours = await staffNotificationService.updateStuckThreshold({
        workspaceId: input.workspaceId,
        hours: input.hours,
      })
      return { hours }
    }),
}
