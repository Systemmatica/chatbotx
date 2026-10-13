/** A request was given up on because it took longer than its timeout. */
export class RequestTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`)
    this.name = "RequestTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError"

/**
 * Runs `run` with an AbortSignal that fires after `timeoutMs` or when the
 * caller's `signal` aborts (e.g. the component unmounted).
 *
 * The returned promise settles on timeout/abort even if `run` ignores the
 * signal, so a stalled request can never leave a UI waiting forever: it
 * rejects with `RequestTimeoutError` on timeout and with the caller's abort
 * reason on abort.
 */
export function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  const { timeoutMs, signal } = options
  const controller = new AbortController()

  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
    }
    const fail = (reason: unknown) => {
      cleanup()
      controller.abort(reason)
      reject(reason)
    }
    function onAbort() {
      fail(signal?.reason ?? new DOMException("Aborted", "AbortError"))
    }

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    timer = setTimeout(
      () => fail(new RequestTimeoutError(timeoutMs)),
      timeoutMs,
    )

    run(controller.signal).then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
  })
}
