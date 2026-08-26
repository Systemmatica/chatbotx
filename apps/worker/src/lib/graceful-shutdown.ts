import { logger } from "./logger"

type Closer = () => Promise<void>

/**
 * Shared shutdown coordinator.
 *
 * Every standalone worker.ts historically registered its own
 * `process.once("SIGTERM", ...)` listener that calls `process.exit()`
 * itself once its own resources are closed. That is safe when a process
 * hosts exactly one worker (today's `worker all` topology: 11 processes,
 * 1 worker each).
 *
 * It stops being safe the moment a single process hosts *several* workers
 * (a memory-saving merge). All registered SIGTERM listeners fire, but each
 * one still calls `process.exit()` on its own — so whichever worker
 * finishes `.close()` first kills the whole process, yanking every other
 * worker's Redis/BullMQ connection closed mid-drain instead of letting it
 * finish gracefully.
 *
 * This module centralizes that: each worker registers a `close()`
 * function instead of its own signal handler + exit call. Exactly one
 * SIGINT/SIGTERM listener is installed process-wide, and it waits for
 * every registered closer (in parallel) before calling `process.exit`
 * exactly once. Behaviour is unchanged for a process that registers a
 * single worker.
 */
const closers: { name: string; fn: Closer }[] = []
let installed = false
let shuttingDown = false

async function handleSignal(signal: NodeJS.Signals) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  logger.info(
    { signal, workers: closers.map((c) => c.name) },
    "Shutting down worker process",
  )

  const results = await Promise.allSettled(closers.map((c) => c.fn()))

  let failed = false
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failed = true
      logger.error(
        { err: result.reason, worker: closers[index]?.name },
        "Error during worker shutdown",
      )
    }
  })

  process.exit(failed ? 1 : 0)
}

/**
 * Start a shutdown without awaiting it.
 *
 * A rejected promise dropped on the floor here would surface as an unhandled
 * rejection at the worst possible moment — during shutdown, when the process
 * is already on its way out and the log is the only evidence left. So the
 * rejection is caught and logged rather than discarded.
 */
function startShutdown(signal: NodeJS.Signals): void {
  handleSignal(signal).catch((error) => {
    logger.error({ err: error, signal }, "Shutdown handler itself failed")
    process.exit(1)
  })
}

export function registerShutdown(name: string, fn: Closer): void {
  closers.push({ name, fn })

  if (!installed) {
    installed = true
    process.once("SIGINT", () => startShutdown("SIGINT"))
    process.once("SIGTERM", () => startShutdown("SIGTERM"))
  }
}

/**
 * Manual trigger for callers that need to force a coordinated shutdown
 * outside of SIGINT/SIGTERM (e.g. a worker's own `uncaughtException` /
 * `unhandledRejection` handler deciding the process state may be
 * corrupted). Runs every registered closer, not just the caller's own —
 * a merged process must not exit while leaving sibling workers' BullMQ
 * connections open.
 */
export function triggerShutdown(signal: NodeJS.Signals): void {
  startShutdown(signal)
}
