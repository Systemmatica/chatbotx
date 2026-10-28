import { ChatbotXException } from "@chatbotx.io/business/errors"
import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import { ORPCError, onError } from "@orpc/server"
import { logger } from "./lib/log"
import { authMiddleware } from "./middlewares/auth"
import { channelApiTokenAuthMidddleware } from "./middlewares/channel-api-token-auth"
import { base } from "./middlewares/context"
import { workspaceTokenAuthMidddleware } from "./middlewares/workspace-token-auth"

export const authorizedAPI = base
  .use(
    onError((error: Error) => {
      logger.error(
        { err: error, cause: JSON.stringify(error.cause) },
        "Error in authorizedAPI",
      )

      if (error.name === ChatbotXException.name) {
        throw new ORPCError((error as ChatbotXException).code, {
          message: error.message,
          status: (error as ChatbotXException).httpStatusCode || 400,
        })
      }

      if (error.name === ModelNotfoundException.name) {
        throw new ORPCError("notFound", {
          message: error.message,
          status: 404,
        })
      }
    }),
  )
  .use(authMiddleware)

// Shared actions reused by the public API report field errors the way the UI
// expects them: next-safe-action's `returnValidationErrors` throws an error
// carrying `validationErrors`, and a few helpers call `schema.parse` directly.
// Without this mapping both surface as an opaque 500 to API clients.
const toPublicValidationError = (
  error: Error,
): ORPCError<string, unknown> | null => {
  if ("validationErrors" in error) {
    return new ORPCError("invalidRequestData", {
      message: "Validation error",
      status: 422,
      data: { validationErrors: error.validationErrors },
    })
  }

  if (error.name === "ZodError" && "issues" in error) {
    return new ORPCError("invalidRequestData", {
      message: "Validation error",
      status: 422,
      data: { issues: error.issues },
    })
  }

  return null
}

export const workspaceTokenAuthAPI = base
  .use(
    onError((error: Error) => {
      const validationError = toPublicValidationError(error)
      if (validationError) {
        throw validationError
      }

      if (error.name === ChatbotXException.name) {
        throw new ORPCError((error as ChatbotXException).code, {
          message: error.message,
          status: (error as ChatbotXException).httpStatusCode || 400,
        })
      }

      if (error.name === ModelNotfoundException.name) {
        throw new ORPCError("notFound", {
          message: error.message,
          status: 404,
        })
      }
    }),
  )
  .use(workspaceTokenAuthMidddleware)

export const channelApiTokenAPI = base
  .use(
    onError((error: Error) => {
      if (error.name === ChatbotXException.name) {
        throw new ORPCError((error as ChatbotXException).code, {
          message: error.message,
          status: (error as ChatbotXException).httpStatusCode || 400,
        })
      }

      if (error.name === ModelNotfoundException.name) {
        throw new ORPCError("notFound", {
          message: error.message,
          status: 404,
        })
      }
    }),
  )
  .use(channelApiTokenAuthMidddleware)
