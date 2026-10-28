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
  broadcastService: { cancelScheduled: vi.fn(), reschedule: vi.fn() },
  broadcastAnalyticsService: { getStats: vi.fn() },
  createBroadcast: vi.fn(),
  updateBroadcast: vi.fn(),
  listBroadcastAudience: vi.fn(),
  listWorkspaceBroadcasts: vi.fn(),
  publicGetBroadcast: vi.fn(),
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@chatbotx.io/business", () => ({
  broadcastService: mocks.broadcastService,
}))
vi.mock("@chatbotx.io/analytics", async () => ({
  ...(await import("@chatbotx.io/analytics/schemas")),
  broadcastAnalyticsService: mocks.broadcastAnalyticsService,
}))
vi.mock("@/features/broadcasts/actions/create-broadcast.action", () => ({
  createBroadcast: mocks.createBroadcast,
}))
vi.mock("@/features/broadcasts/actions/update-broadcast.action", () => ({
  updateBroadcast: mocks.updateBroadcast,
}))
vi.mock("@/features/broadcasts/queries", () => ({
  listBroadcastAudience: mocks.listBroadcastAudience,
  listWorkspaceBroadcasts: mocks.listWorkspaceBroadcasts,
  publicGetBroadcast: mocks.publicGetBroadcast,
}))

await import("@/features/broadcasts/api/workspace-token")

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
const broadcast = { id: "b-1", name: "Promo", status: "scheduled" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.publicGetBroadcast.mockResolvedValue(broadcast)
})

describe("GET /v1/broadcasts", () => {
  const procedure = findProcedure("GET", "/v1/broadcasts")

  test("lists without the session-only access check", async () => {
    mocks.listWorkspaceBroadcasts.mockResolvedValueOnce({
      data: [broadcast],
      pageCount: 1,
    })

    await expect(procedure.handler?.({ context })).resolves.toEqual({
      data: [broadcast],
    })
    expect(mocks.listWorkspaceBroadcasts).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
  })
})

describe("POST /v1/broadcasts", () => {
  const procedure = findProcedure("POST", "/v1/broadcasts")

  test("creates through the shared action logic with full token access", async () => {
    mocks.createBroadcast.mockResolvedValueOnce(broadcast)
    const input = {
      channel: "telegram",
      subaction: "telegramAllContacts",
      flowId: "flow-1",
      schedulesType: "now",
      schedulesAt: null,
    }

    await expect(procedure.handler?.({ context, input })).resolves.toBe(
      broadcast,
    )
    expect(mocks.createBroadcast).toHaveBeenCalledWith("ws-1", input, {
      canViewEmailAndPhone: true,
    })
  })
})

describe("PUT /v1/broadcasts/{idOrName}/schedule", () => {
  const procedure = findProcedure("PUT", "/v1/broadcasts/{idOrName}/schedule")

  test("reschedules a scheduled broadcast", async () => {
    const schedulesAt = new Date("2030-01-01T10:00:00Z")
    mocks.broadcastService.reschedule.mockResolvedValueOnce({
      ...broadcast,
      schedulesAt,
    })

    await procedure.handler?.({
      context,
      input: { idOrName: "Promo", schedulesAt },
    })

    expect(mocks.publicGetBroadcast).toHaveBeenCalledWith("ws-1", "Promo")
    expect(mocks.broadcastService.reschedule).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "b-1",
      schedulesAt,
    })
  })

  test("409s when the broadcast already started", async () => {
    mocks.broadcastService.reschedule.mockResolvedValueOnce(null)

    await expect(
      procedure.handler?.({
        context,
        input: { idOrName: "b-1", schedulesAt: new Date("2030-01-01") },
      }),
    ).rejects.toMatchObject({ httpStatusCode: 409 })
  })
})

describe("POST /v1/broadcasts/{idOrName}/cancel", () => {
  const procedure = findProcedure("POST", "/v1/broadcasts/{idOrName}/cancel")

  test("cancels a scheduled broadcast", async () => {
    mocks.broadcastService.cancelScheduled.mockResolvedValueOnce({
      ...broadcast,
      status: "cancelled",
    })

    await expect(
      procedure.handler?.({ context, input: { idOrName: "b-1" } }),
    ).resolves.toMatchObject({ status: "cancelled" })
  })

  test("409s when the broadcast is not scheduled any more", async () => {
    mocks.broadcastService.cancelScheduled.mockResolvedValueOnce(null)

    await expect(
      procedure.handler?.({ context, input: { idOrName: "b-1" } }),
    ).rejects.toMatchObject({ httpStatusCode: 409 })
  })
})

describe("PATCH /v1/broadcasts/{idOrName}", () => {
  const procedure = findProcedure("PATCH", "/v1/broadcasts/{idOrName}")

  test("renames through updateBroadcast", async () => {
    await procedure.handler?.({
      context,
      input: { idOrName: "b-1", name: "New name" },
    })

    expect(mocks.updateBroadcast).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "b-1" },
      { name: "New name" },
    )
  })
})

describe("GET /v1/broadcasts/{idOrName}/stats", () => {
  const procedure = findProcedure("GET", "/v1/broadcasts/{idOrName}/stats")

  test("returns delivery stats for the resolved broadcast", async () => {
    mocks.broadcastAnalyticsService.getStats.mockResolvedValueOnce({ sent: 3 })

    await expect(
      procedure.handler?.({ context, input: { idOrName: "Promo" } }),
    ).resolves.toEqual({ sent: 3 })
    expect(mocks.broadcastAnalyticsService.getStats).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })
  })
})
