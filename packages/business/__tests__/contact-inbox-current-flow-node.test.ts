import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockReturning, mockSet, mockUpdate, mockWhere } = vi.hoisted(() => {
  const mockReturning = vi.fn()
  const mockWhere = vi.fn()
  const mockSet = vi.fn()
  const chain = { set: mockSet, where: mockWhere, returning: mockReturning }
  mockSet.mockReturnValue(chain)
  mockWhere.mockReturnValue(chain)
  return {
    mockReturning,
    mockSet,
    mockWhere,
    mockUpdate: vi.fn().mockReturnValue(chain),
  }
})

const mockSql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  }),
  { join: vi.fn((chunks: unknown[]) => ({ chunks })) },
)

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  db: { update: mockUpdate },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  isUniqueViolationError: vi.fn(),
  or: vi.fn(),
  sql: mockSql,
}))
vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { contactInboxService } = await import("../src/contact-inbox/service")
const { CURRENT_FLOW_NODE_REFRESH_MS, shouldRecordCurrentFlowNode } =
  await import("../src/contact-inbox/current-flow-node")

const NOW = new Date("2026-10-06T12:00:00.000Z")
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000)
const NEXT = { flowId: "100", nodeId: "node-b" }

describe("shouldRecordCurrentFlowNode", () => {
  test("records when nothing was recorded yet", () => {
    expect(shouldRecordCurrentFlowNode(null, NEXT, NOW)).toBe(true)
    expect(shouldRecordCurrentFlowNode({}, NEXT, NOW)).toBe(true)
  })

  test("always records a different node, even within the window", () => {
    expect(
      shouldRecordCurrentFlowNode(
        { currentFlowId: "100", currentNodeId: "node-a", currentNodeAt: NOW },
        NEXT,
        NOW,
      ),
    ).toBe(true)
  })

  test("always records the same node id in a different flow", () => {
    expect(
      shouldRecordCurrentFlowNode(
        { currentFlowId: "200", currentNodeId: "node-b", currentNodeAt: NOW },
        NEXT,
        NOW,
      ),
    ).toBe(true)
  })

  test("skips the same node re-entered inside the window", () => {
    expect(
      shouldRecordCurrentFlowNode(
        {
          currentFlowId: "100",
          currentNodeId: "node-b",
          currentNodeAt: secondsAgo(59),
        },
        NEXT,
        NOW,
      ),
    ).toBe(false)
  })

  test("refreshes the same node once the window has passed", () => {
    expect(CURRENT_FLOW_NODE_REFRESH_MS).toBe(60_000)
    expect(
      shouldRecordCurrentFlowNode(
        {
          currentFlowId: "100",
          currentNodeId: "node-b",
          currentNodeAt: secondsAgo(60),
        },
        NEXT,
        NOW,
      ),
    ).toBe(true)
  })

  test("accepts an ISO string timestamp from a serialized job payload", () => {
    expect(
      shouldRecordCurrentFlowNode(
        {
          currentFlowId: "100",
          currentNodeId: "node-b",
          currentNodeAt: secondsAgo(10).toISOString(),
        },
        NEXT,
        NOW,
      ),
    ).toBe(false)
  })

  test("records when the stored timestamp is missing or unparseable", () => {
    expect(
      shouldRecordCurrentFlowNode(
        { currentFlowId: "100", currentNodeId: "node-b", currentNodeAt: null },
        NEXT,
        NOW,
      ),
    ).toBe(true)
    expect(
      shouldRecordCurrentFlowNode(
        {
          currentFlowId: "100",
          currentNodeId: "node-b",
          currentNodeAt: "not-a-date",
        },
        NEXT,
        NOW,
      ),
    ).toBe(true)
  })
})

describe("contactInboxService.recordCurrentFlowNode", () => {
  const base = {
    contactInboxId: "ci-1",
    contactId: "contact-1",
    workspaceId: "ws-1",
    flowId: "100",
    nodeId: "node-b",
    at: NOW,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockReturning.mockResolvedValue([{ id: "ci-1" }])
  })

  test("skips the DB round trip when the held row is a fresh same-node hit", async () => {
    const written = await contactInboxService.recordCurrentFlowNode({
      ...base,
      previous: {
        currentFlowId: "100",
        currentNodeId: "node-b",
        currentNodeAt: secondsAgo(5),
      },
    })

    expect(written).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test("writes all three columns for a new node", async () => {
    const written = await contactInboxService.recordCurrentFlowNode({
      ...base,
      previous: {
        currentFlowId: "100",
        currentNodeId: "node-a",
        currentNodeAt: secondsAgo(5),
      },
    })

    expect(written).toBe(true)
    expect(mockSet).toHaveBeenCalledWith({
      currentFlowId: "100",
      currentNodeId: "node-b",
      currentNodeAt: NOW,
    })
    expect(mockWhere).toHaveBeenCalledTimes(1)
  })

  test("carries the same throttle as a SQL guard (window start = at - 60s)", async () => {
    await contactInboxService.recordCurrentFlowNode(base)

    const where = mockWhere.mock.calls[0]?.[0] as { and: unknown[] }
    const guard = where.and.at(-1) as { strings: string[]; values: unknown[] }
    expect(guard.strings.join("?")).toContain("IS NOT DISTINCT FROM")
    expect(guard.values).toContain("100")
    expect(guard.values).toContain("node-b")
    expect(guard.values).toContainEqual(
      new Date(NOW.getTime() - CURRENT_FLOW_NODE_REFRESH_MS),
    )
  })

  test("reports no write when the guard matched no row", async () => {
    mockReturning.mockResolvedValue([])

    await expect(contactInboxService.recordCurrentFlowNode(base)).resolves.toBe(
      false,
    )
  })
})
