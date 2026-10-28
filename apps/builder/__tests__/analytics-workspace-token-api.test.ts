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
  contactAnalyticsService: {
    getContactsCount: vi.fn(),
    getNewContactsCount: vi.fn(),
    getBlockedContactsCount: vi.fn(),
    getContactCountsPerDay: vi.fn(),
    getNewContactsPerDay: vi.fn(),
    getBlockedContactsPerDay: vi.fn(),
    getContactsByCountry: vi.fn(),
    getContactsByChannel: vi.fn(),
    getContactsBySource: vi.fn(),
  },
  macAnalyticsService: { getActiveContactsByWorkspaceForRange: vi.fn() },
  messageAnalyticsService: { getMessagesBySender: vi.fn() },
  listTags: vi.fn(),
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
// Schemas come from the side-effect-free entry; services are mocked so the
// test never touches the database client.
vi.mock("@chatbotx.io/analytics", async () => ({
  ...(await import("@chatbotx.io/analytics/schemas")),
  contactAnalyticsService: mocks.contactAnalyticsService,
  macAnalyticsService: mocks.macAnalyticsService,
  messageAnalyticsService: mocks.messageAnalyticsService,
}))
vi.mock("@/features/tags/queries", () => ({ listTags: mocks.listTags }))

await import("@/features/analytics/api/workspace-token")
const { publicTimeRangeQuery } = await import(
  "@/features/analytics/schemas/public-time-range"
)

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
const range = {
  from: new Date("2026-01-01T00:00:00Z"),
  to: new Date("2026-01-31T23:59:59Z"),
  timezone: "Europe/Moscow",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("publicTimeRangeQuery", () => {
  test("defaults the time zone to UTC", () => {
    const parsed = publicTimeRangeQuery.parse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
    })

    expect(parsed.timezone).toBe("UTC")
    expect(parsed.from).toBeInstanceOf(Date)
  })

  test("rejects an unknown time zone instead of failing in SQL", () => {
    expect(
      publicTimeRangeQuery.safeParse({
        from: "2026-01-01T00:00:00Z",
        to: "2026-01-02T00:00:00Z",
        timezone: "Mars/Olympus",
      }).success,
    ).toBe(false)
  })
})

describe("GET /v1/analytics/contacts/summary", () => {
  const procedure = findProcedure("GET", "/v1/analytics/contacts/summary")

  test("combines the dashboard counters for the token workspace", async () => {
    mocks.contactAnalyticsService.getContactsCount.mockResolvedValueOnce(10)
    mocks.contactAnalyticsService.getNewContactsCount.mockResolvedValueOnce(4)
    mocks.contactAnalyticsService.getBlockedContactsCount.mockResolvedValueOnce(
      1,
    )
    mocks.macAnalyticsService.getActiveContactsByWorkspaceForRange.mockResolvedValueOnce(
      7,
    )

    await expect(
      procedure.handler?.({ context, input: range }),
    ).resolves.toEqual({ data: { total: 10, new: 4, blocked: 1, active: 7 } })
    expect(mocks.contactAnalyticsService.getContactsCount).toHaveBeenCalledWith(
      {
        ...range,
        workspaceId: "ws-1",
      },
    )
  })
})

describe("GET /v1/analytics/contacts/per-day", () => {
  const procedure = findProcedure("GET", "/v1/analytics/contacts/per-day")

  test.each([
    ["total", "getContactCountsPerDay"],
    ["new", "getNewContactsPerDay"],
    ["blocked", "getBlockedContactsPerDay"],
  ] as const)("metric %s uses %s", async (metric, method) => {
    mocks.contactAnalyticsService[method].mockResolvedValueOnce([])

    await procedure.handler?.({ context, input: { ...range, metric } })

    expect(mocks.contactAnalyticsService[method]).toHaveBeenCalledWith({
      ...range,
      workspaceId: "ws-1",
    })
  })
})

describe("GET /v1/analytics/contacts/by-dimension", () => {
  const procedure = findProcedure("GET", "/v1/analytics/contacts/by-dimension")

  test("routes the dimension to the matching query", async () => {
    mocks.contactAnalyticsService.getContactsByChannel.mockResolvedValueOnce([
      { key: "telegram", count: 3 },
    ])

    await expect(
      procedure.handler?.({
        context,
        input: { ...range, dimension: "channel" },
      }),
    ).resolves.toEqual({ data: [{ key: "telegram", count: 3 }] })
  })
})

describe("GET /v1/analytics/messages/by-sender", () => {
  const procedure = findProcedure("GET", "/v1/analytics/messages/by-sender")

  test("passes granularity through", async () => {
    mocks.messageAnalyticsService.getMessagesBySender.mockResolvedValueOnce([])

    await procedure.handler?.({
      context,
      input: { ...range, granularity: "month" },
    })

    expect(
      mocks.messageAnalyticsService.getMessagesBySender,
    ).toHaveBeenCalledWith({
      ...range,
      granularity: "month",
      workspaceId: "ws-1",
    })
  })
})

describe("GET /v1/analytics/tags", () => {
  const procedure = findProcedure("GET", "/v1/analytics/tags")

  test("returns contacts per tag", async () => {
    mocks.listTags.mockResolvedValueOnce({
      data: [
        { id: "t-1", name: "lead", contactsCount: 12 },
        { id: "t-2", name: "client" },
      ],
    })

    await expect(procedure.handler?.({ context })).resolves.toEqual({
      data: [
        { id: "t-1", name: "lead", contactsCount: 12 },
        { id: "t-2", name: "client", contactsCount: 0 },
      ],
    })
    expect(mocks.listTags).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
  })
})
