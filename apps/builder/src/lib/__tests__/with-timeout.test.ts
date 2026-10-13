import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { isAbortError, RequestTimeoutError, withTimeout } from "../with-timeout"

const never = () => new Promise<never>(() => undefined)

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("resolves with the request's value when it answers in time", async () => {
    const result = withTimeout(async () => "boards", { timeoutMs: 1000 })
    await expect(result).resolves.toBe("boards")
  })

  test("passes through the request's own error", async () => {
    const error = new Error("server error")
    await expect(
      withTimeout(() => Promise.reject(error), { timeoutMs: 1000 }),
    ).rejects.toBe(error)
  })

  test("rejects with RequestTimeoutError when the request never settles", async () => {
    const result = withTimeout(never, { timeoutMs: 1000 })
    const assertion = expect(result).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  test("aborts the request's signal on timeout", async () => {
    let received: AbortSignal | undefined
    const result = withTimeout(
      (signal) => {
        received = signal
        return never()
      },
      { timeoutMs: 500 },
    )
    result.catch(() => undefined)
    expect(received?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(received?.aborted).toBe(true)
    expect(received?.reason).toBeInstanceOf(RequestTimeoutError)
  })

  test("settles with an abort error when the caller aborts (unmount)", async () => {
    const controller = new AbortController()
    const result = withTimeout(never, {
      timeoutMs: 1000,
      signal: controller.signal,
    })
    controller.abort()
    await expect(result).rejects.toSatisfy(isAbortError)
  })

  test("rejects immediately when the caller's signal is already aborted", async () => {
    const run = vi.fn(never)
    const controller = new AbortController()
    controller.abort()
    await expect(
      withTimeout(run, { timeoutMs: 1000, signal: controller.signal }),
    ).rejects.toSatisfy(isAbortError)
    expect(run).not.toHaveBeenCalled()
  })

  test("does not time out a request that already answered", async () => {
    const result = await withTimeout(async () => 1, { timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(result).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
