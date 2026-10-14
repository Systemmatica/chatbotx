// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useVisibleInterval } from "../use-visible-interval"

let visibility: DocumentVisibilityState = "visible"
let container: HTMLDivElement
let root: Root

function Harness({
  callback,
  enabled = true,
}: {
  callback: () => unknown
  enabled?: boolean
}) {
  useVisibleInterval(callback, 5000, { enabled })
  return null
}

const render = (callback: () => unknown, enabled = true) => {
  act(() => {
    root.render(<Harness callback={callback} enabled={enabled} />)
  })
}

const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  visibility = "visible"
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe("useVisibleInterval", () => {
  test("ticks every interval while visible, not on mount", async () => {
    const callback = vi.fn()
    render(callback)

    expect(callback).not.toHaveBeenCalled()
    await advance(5000)
    expect(callback).toHaveBeenCalledTimes(1)
    await advance(10_000)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  test("pauses while hidden and runs at once when visible again", async () => {
    const callback = vi.fn()
    render(callback)

    setVisibility("hidden")
    await advance(60_000)
    expect(callback).not.toHaveBeenCalled()

    setVisibility("visible")
    expect(callback).toHaveBeenCalledTimes(1)
    await advance(5000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  test("refetches on window focus, once for focus + visibilitychange", () => {
    const callback = vi.fn()
    render(callback)

    setVisibility("visible")
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test("does not start while mounted hidden", async () => {
    visibility = "hidden"
    const callback = vi.fn()
    render(callback)

    await advance(20_000)
    expect(callback).not.toHaveBeenCalled()
  })

  test("skips ticks while the previous run is still pending", async () => {
    let resolve: () => void = () => undefined
    const callback = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    render(callback)

    await advance(5000)
    expect(callback).toHaveBeenCalledTimes(1)
    await advance(15_000)
    expect(callback).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolve()
      await Promise.resolve()
    })
    await advance(5000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  test("a rejected run does not stop the interval", async () => {
    const callback = vi.fn(() => Promise.reject(new Error("offline")))
    render(callback)

    await advance(5000)
    await advance(5000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  test("does nothing while disabled and stops on unmount", async () => {
    const callback = vi.fn()
    render(callback, false)
    await advance(20_000)
    expect(callback).not.toHaveBeenCalled()

    render(callback, true)
    await advance(5000)
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
    root = createRoot(container)
    await advance(20_000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test("always calls the latest callback", async () => {
    const first = vi.fn()
    const second = vi.fn()
    render(first)
    render(second)

    await advance(5000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
