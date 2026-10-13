import { AsyncLocalStorage } from "node:async_hooks"
import type { ContactActivityActor } from "@chatbotx.io/database/repositories"

/**
 * Who is performing the current request, for the contact activity log. The
 * builder sets it once per authenticated request (server action / oRPC
 * middleware), so every tag, field or assignment change made in that request
 * is attributed without threading a user id through each call site. Without
 * a context (worker jobs, channel webhooks) the change is the bot's.
 */
const activityActorStorage = new AsyncLocalStorage<ContactActivityActor>()

const BOT_ACTOR: ContactActivityActor = { type: "bot" }

export function runWithActivityActor<T>(
  actor: ContactActivityActor,
  callback: () => T,
): T {
  return activityActorStorage.run(actor, callback)
}

export function getActivityActor(): ContactActivityActor {
  return activityActorStorage.getStore() ?? BOT_ACTOR
}
