import { startWorker, stopWorker } from "@chatbotx.io/event-bus/worker"
import { ensureBootstrapped } from "../lib/bootstrap"
import { registerShutdown, triggerShutdown } from "../lib/graceful-shutdown"
import { analyticsDashboardEvents } from "./analytics"
import flowEventListener from "./flow"
import messageEventListener from "./message"

async function startEventWorker() {
  try {
    await ensureBootstrapped()
    console.log("Event worker bootstrapped successfully")
  } catch (err) {
    console.error("Failed to bootstrap event worker", err)
    process.exit(1)
  }

  startWorker([
    messageEventListener,
    flowEventListener,
    analyticsDashboardEvents,
  ])

  registerShutdown("events", () => stopWorker())
}

startEventWorker()

// A process-wide safety net: if anything in this process throws
// uncaught (own handler or a sibling worker's, when several workers
// share one process), force a coordinated shutdown of every registered
// worker rather than limping on with unknown state.
process.on("uncaughtException", (error) => {
  console.error("[EventWorker] Uncaught exception", error)
  triggerShutdown("SIGTERM")
})

process.on("unhandledRejection", (reason) => {
  console.error("[EventWorker] Unhandled rejection", reason)
  triggerShutdown("SIGTERM")
})
