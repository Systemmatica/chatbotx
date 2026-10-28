import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPI, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  return {
    workspaceTokenAuthAPI: {
      route: vi.fn((config: RouteConfig) => makeProcedure(config)),
    },
    capturedProcedures,
  }
})

const mocks = vi.hoisted(() => ({
  triggerService: { listByWorkspaceId: vi.fn(), listDailyStats: vi.fn() },
  createTrigger: vi.fn(),
  deleteTriggers: vi.fn(),
  updateTrigger: vi.fn(),
  updateTriggerSettings: vi.fn(),
  findTrigger: vi.fn(),
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@chatbotx.io/business", () => ({
  triggerService: mocks.triggerService,
}))
vi.mock("@/features/triggers/actions/create-trigger-action", () => ({
  createTrigger: mocks.createTrigger,
}))
vi.mock("@/features/triggers/actions/delete-triggers-action", () => ({
  deleteTriggers: mocks.deleteTriggers,
}))
vi.mock("@/features/triggers/actions/update-trigger-action", () => ({
  updateTrigger: mocks.updateTrigger,
}))
vi.mock("@/features/triggers/actions/update-trigger-settings-action", () => ({
  updateTriggerSettings: mocks.updateTriggerSettings,
}))
vi.mock("@/features/triggers/queries", () => ({
  findTrigger: mocks.findTrigger,
}))
await import("@/features/triggers/api/workspace-token")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const context = { workspace: { id: "ws-1" } }
const trigger = { id: "tr-1", workspaceId: "ws-1", conditions: [], actions: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findTrigger.mockResolvedValue(trigger)
})

describe("GET /v1/triggers/{id}", () => {
  const procedure = findProcedure("GET", "/v1/triggers/{id}")

  test("scopes the lookup to the token workspace", async () => {
    await expect(
      procedure.handler?.({ context, input: { id: "tr-1" } }),
    ).resolves.toEqual(trigger)
    expect(mocks.findTrigger).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "tr-1",
    })
  })

  test("404s for a trigger outside the workspace", async () => {
    mocks.findTrigger.mockResolvedValueOnce(null)

    await expect(
      procedure.handler?.({ context, input: { id: "foreign" } }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })
})

describe("POST /v1/triggers", () => {
  const procedure = findProcedure("POST", "/v1/triggers")

  test("creates through the shared action logic", async () => {
    mocks.createTrigger.mockResolvedValueOnce({ id: "tr-1" })

    await procedure.handler?.({
      context,
      input: { name: "On tag", folderId: null },
    })

    expect(mocks.createTrigger).toHaveBeenCalledWith("ws-1", {
      name: "On tag",
      folderId: null,
    })
  })
})

describe("PATCH /v1/triggers/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/triggers/{id}")

  test("toggles active through updateTriggerSettings", async () => {
    await procedure.handler?.({ context, input: { id: "tr-1", active: true } })

    expect(mocks.updateTriggerSettings).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "tr-1" },
      { active: true },
    )
  })
})

describe("PUT /v1/triggers/{id}/rules", () => {
  const procedure = findProcedure("PUT", "/v1/triggers/{id}/rules")

  test("replaces conditions and actions through updateTrigger", async () => {
    const rules = { conditions: [{ type: "tagApplied" }], actions: [] }

    await procedure.handler?.({ context, input: { id: "tr-1", ...rules } })

    expect(mocks.updateTrigger).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "tr-1" },
      rules,
    )
  })
})

describe("DELETE /v1/triggers/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/triggers/{id}")

  test("404s when nothing was deleted", async () => {
    mocks.deleteTriggers.mockResolvedValueOnce([])

    await expect(
      procedure.handler?.({ context, input: { id: "tr-1" } }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
    expect(mocks.deleteTriggers).toHaveBeenCalledWith("ws-1", ["tr-1"])
  })
})

describe("GET /v1/triggers/{id}/stats", () => {
  const procedure = findProcedure("GET", "/v1/triggers/{id}/stats")

  test("returns the daily counters of the trigger", async () => {
    const from = new Date("2026-01-01T00:00:00Z")
    mocks.triggerService.listDailyStats.mockResolvedValueOnce([])

    await expect(
      procedure.handler?.({ context, input: { id: "tr-1", from } }),
    ).resolves.toEqual({ data: [] })
    expect(mocks.triggerService.listDailyStats).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      triggerId: "tr-1",
      from,
      to: undefined,
    })
  })
})
