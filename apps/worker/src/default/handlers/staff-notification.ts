import { staffNotificationService } from "@chatbotx.io/business"
import type {
  JobDeliverStaffNotification,
  JobNotifyStaff,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

/** Resolves recipients + text for one staff event and fans out deliveries. */
export async function notifyStaff(
  data: JobNotifyStaff["data"],
  jobId: string,
): Promise<void> {
  const { recipients } = await staffNotificationService.processEvent({
    workspaceId: data.workspaceId,
    event: data.event,
    jobId,
  })
  logger.debug(
    { workspaceId: data.workspaceId, kind: data.event.kind, recipients },
    "[staff-notifier] event processed",
  )
}

/** Sends one Telegram message to one member (403 unlinks, 429/5xx retry). */
export async function deliverStaffNotification(
  data: JobDeliverStaffNotification["data"],
): Promise<void> {
  await staffNotificationService.deliver(data)
}
