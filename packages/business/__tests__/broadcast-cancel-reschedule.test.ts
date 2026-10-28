import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const returning = vi.fn()
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  return {
    update: vi.fn(() => ({ set })),
    set,
    where,
    returning,
    eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
    and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: mocks.update },
  and: mocks.and,
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: mocks.eq,
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactInboxContactFilterSQL: vi.fn(),
  contactInboxInteractedWithin24hSQL: vi.fn(),
  pruneEmailPhoneFilterConditions: vi.fn(),
}))

vi.mock("@chatbotx.io/database/utils", () => ({ chunkById: vi.fn() }))
vi.mock("../src/inbox/service", () => ({ inboxService: {} }))
vi.mock("../src/folder/service", () => ({ folderService: {} }))
vi.mock("../src/flow/service", () => ({ flowService: {} }))
vi.mock("../src/flow-version", () => ({ flowVersionService: {} }))

const { broadcastService } = await import("../src/broadcast/service")
const { broadcastModel } = await import("@chatbotx.io/database/schema")

describe("broadcastService.cancelScheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("only flips a broadcast that is still scheduled", async () => {
    mocks.returning.mockResolvedValueOnce([{ id: "b-1", status: "cancelled" }])

    await expect(
      broadcastService.cancelScheduled({ workspaceId: "ws-1", id: "b-1" }),
    ).resolves.toEqual({ id: "b-1", status: "cancelled" })

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    )
    expect(mocks.eq).toHaveBeenCalledWith(broadcastModel.workspaceId, "ws-1")
    expect(mocks.eq).toHaveBeenCalledWith(broadcastModel.status, "scheduled")
  })

  test("returns null when the broadcast is already sending or sent", async () => {
    mocks.returning.mockResolvedValueOnce([])

    await expect(
      broadcastService.cancelScheduled({ workspaceId: "ws-1", id: "b-1" }),
    ).resolves.toBeNull()
  })
})

describe("broadcastService.reschedule", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("moves schedulesAt of a scheduled broadcast", async () => {
    const schedulesAt = new Date("2030-01-01T10:00:00Z")
    mocks.returning.mockResolvedValueOnce([{ id: "b-1", schedulesAt }])

    await broadcastService.reschedule({
      workspaceId: "ws-1",
      id: "b-1",
      schedulesAt,
    })

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ schedulesAt, schedulesType: "future" }),
    )
    expect(mocks.eq).toHaveBeenCalledWith(broadcastModel.status, "scheduled")
  })
})
