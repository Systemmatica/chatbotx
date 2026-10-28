// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn(() => ({ where }))
  return {
    findFirst: vi.fn(),
    update: vi.fn(() => ({ set })),
    set,
    where,
    updateTriggerCache: vi.fn(),
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { triggerModel: { findFirst: mocks.findFirst } },
    update: mocks.update,
  },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  triggerModel: { id: "id" },
}))

vi.mock("@chatbotx.io/events", () => ({
  updateTriggerCache: mocks.updateTriggerCache,
}))

const { updateTriggerSettings } = await import(
  "../src/features/triggers/actions/update-trigger-settings-action"
)

describe("updateTriggerSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("refreshes the trigger cache after an activation change", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "tr-1" })

    await updateTriggerSettings(
      { workspaceId: "ws-1", id: "tr-1" },
      { active: false },
    )

    expect(mocks.set).toHaveBeenCalledWith({ active: false })
    expect(mocks.updateTriggerCache).toHaveBeenCalledWith("ws-1")
  })

  test("throws a 404 for a trigger outside the workspace", async () => {
    mocks.findFirst.mockResolvedValueOnce(undefined)

    await expect(
      updateTriggerSettings({ workspaceId: "ws-1", id: "x" }, { name: "n" }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
