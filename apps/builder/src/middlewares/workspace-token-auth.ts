import {
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { runWithActivityActor } from "@chatbotx.io/events/context"
import { ORPCError } from "@orpc/server"
import { base } from "./context"

export const workspaceTokenAuthMidddleware = base.middleware(
  async ({ context, next }) => {
    const authHeader = context.headers.get("Authorization")
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null
    const apiKeyToken = context.url
      ? new URL(context.url).searchParams.get("token")
      : null
    const token = bearerToken ?? apiKeyToken
    if (!token) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    const workspace = await workspaceService.find({ where: { token } })
    if (!workspace) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace deletion scheduled",
      })
    }

    // Adds the workspace to the context; contact changes made through the
    // public API show as "API" in the contact activity log.
    return await runWithActivityActor({ type: "api" }, () =>
      next({
        context: {
          workspace,
        },
      }),
    )
  },
)
