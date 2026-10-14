// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useLocale: () => "ru",
  useTranslations: () => (key: string) =>
    key === "justNow" ? "только что" : key,
}))

const { useRelativeTime } = await import("../use-relative-time")

let container: HTMLDivElement
let root: Root
let renders = 0

function Label({ value }: { value: number | null }) {
  renders += 1
  return <span>{useRelativeTime(value)}</span>
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse("2026-10-14T12:00:00Z"))
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  renders = 0
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe("useRelativeTime", () => {
  test("re-renders on the shared clock without new props", async () => {
    act(() => {
      root.render(<Label value={Date.now()} />)
    })
    expect(container.textContent).toBe("только что")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(container.textContent).toBe("15 секунд назад")
  })

  test("old labels do not re-render on every tick", async () => {
    act(() => {
      root.render(<Label value={Date.now() - 3 * 24 * 60 * 60 * 1000} />)
    })
    expect(container.textContent).toBe("3 дня назад")
    const initialRenders = renders

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(container.textContent).toBe("3 дня назад")
    expect(renders).toBe(initialRenders)
  })

  test("empty for a missing date", () => {
    act(() => {
      root.render(<Label value={null} />)
    })
    expect(container.textContent).toBe("")
  })
})
