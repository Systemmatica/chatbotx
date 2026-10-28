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
  refLinkAnalyticsService: {
    getRefLinkStatsByDateRange: vi.fn(),
    getRefLinkContactStats: vi.fn(),
  },
  createReflink: vi.fn(),
  updateReflink: vi.fn(),
  deleteReflinks: vi.fn(),
  findReflink: vi.fn(),
  listWorkspaceReflinks: vi.fn(),
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@chatbotx.io/analytics", async () => ({
  ...(await import("@chatbotx.io/analytics/schemas")),
  refLinkAnalyticsService: mocks.refLinkAnalyticsService,
}))
vi.mock("@/features/reflinks/actions/create-reflink.action", () => ({
  createReflink: mocks.createReflink,
}))
vi.mock("@/features/reflinks/actions/update-reflink.action", () => ({
  updateReflink: mocks.updateReflink,
}))
vi.mock("@/features/reflinks/actions/delete-reflinks.action", () => ({
  deleteReflinks: mocks.deleteReflinks,
}))
vi.mock("@/features/reflinks/queries", () => ({
  findReflink: mocks.findReflink,
  listWorkspaceReflinks: mocks.listWorkspaceReflinks,
}))

await import("@/features/reflinks/api/workspace-token")

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
const reflink = {
  id: "rl-1",
  workspaceId: "ws-1",
  name: "promo",
  type: "refLink",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findReflink.mockResolvedValue(reflink)
})

describe("GET /v1/ref-links", () => {
  const procedure = findProcedure("GET", "/v1/ref-links")

  test("lists ref links of the token workspace without a session check", async () => {
    mocks.listWorkspaceReflinks.mockResolvedValueOnce({
      data: [],
      pageCount: 0,
    })

    await procedure.handler?.({
      context,
      input: { page: 2, perPage: 10, keyword: "promo" },
    })

    expect(mocks.listWorkspaceReflinks).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      page: 2,
      perPage: 10,
      keyword: "promo",
      sort: [{ id: "createdAt", desc: true }],
    })
  })
})

describe("GET /v1/ref-links/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ref-links/{id}")

  test("404s for a ref link outside the workspace", async () => {
    mocks.findReflink.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "foreign" } }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
    expect(mocks.findReflink).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "foreign",
    })
  })
})

describe("POST /v1/ref-links", () => {
  const procedure = findProcedure("POST", "/v1/ref-links")

  test("creates through the shared action logic", async () => {
    mocks.createReflink.mockResolvedValueOnce(reflink)
    const input = { name: "promo", flowId: "flow-1", customFieldId: null }

    await expect(procedure.handler?.({ context, input })).resolves.toBe(reflink)
    expect(mocks.createReflink).toHaveBeenCalledWith("ws-1", input)
  })
})

describe("PATCH /v1/ref-links/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/ref-links/{id}")

  test("updates and returns the fresh ref link", async () => {
    await expect(
      procedure.handler?.({ context, input: { id: "rl-1", flowId: "flow-2" } }),
    ).resolves.toBe(reflink)
    expect(mocks.updateReflink).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "rl-1" },
      { flowId: "flow-2" },
    )
  })
})

describe("DELETE /v1/ref-links/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ref-links/{id}")

  test("404s when nothing was deleted", async () => {
    mocks.deleteReflinks.mockResolvedValueOnce([])

    await expect(
      procedure.handler?.({ context, input: { id: "rl-1" } }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })
})

describe("GET /v1/ref-links/{id}/stats", () => {
  const procedure = findProcedure("GET", "/v1/ref-links/{id}/stats")

  test("returns the daily series for the ref link", async () => {
    mocks.refLinkAnalyticsService.getRefLinkStatsByDateRange.mockResolvedValueOnce(
      [{ dateReport: "2026-01-02", count: 5 }],
    )

    await expect(
      procedure.handler?.({
        context,
        input: {
          id: "rl-1",
          from: new Date("2026-01-01T00:00:00.000Z"),
          to: new Date("2026-01-31T00:00:00.000Z"),
          timezone: "UTC",
        },
      }),
    ).resolves.toEqual({ data: [{ dateReport: "2026-01-02", count: 5 }] })
    expect(
      mocks.refLinkAnalyticsService.getRefLinkStatsByDateRange,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      linkId: "rl-1",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-01-31T00:00:00.000Z",
      timezone: "UTC",
    })
  })
})

describe("GET /v1/ref-links/{id}/contacts", () => {
  const procedure = findProcedure("GET", "/v1/ref-links/{id}/contacts")

  test("pages through contacts that opened the link", async () => {
    await procedure.handler?.({
      context,
      input: { id: "rl-1", page: 1, perPage: 20 },
    })

    expect(
      mocks.refLinkAnalyticsService.getRefLinkContactStats,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      linkId: "rl-1",
      page: 1,
      perPage: 20,
    })
  })
})
