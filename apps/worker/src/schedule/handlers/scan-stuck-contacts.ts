import { staffNotificationService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"

const log = getChildLogger("scan-stuck-contacts")

const LOCK_KEY = "schedule:scan-stuck-contacts"
// Must stay under the 15-minute cadence (register-schedules.ts) so replicas
// never overlap.
const LOCK_TTL_SECONDS = 14 * 60

/**
 * Finds contacts sitting on one flow step past their workspace threshold and
 * enqueues one `notifyStaff` job per workspace event. The scan is
 * cross-workspace (like the broadcast crons); the per-workspace jobs it
 * enqueues go through the default worker's blocked-owner guard.
 */
export const scanStuckContacts = async (): Promise<void> => {
  if (!staffNotificationService.isConfigured()) {
    return
  }
  await distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const result = await staffNotificationService.scanStuckContacts()
      if (result.notified > 0) {
        log.info(result, "scanStuckContacts: staff notified")
      }
    },
  })
}
