import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  recordCurrentFlowNode: vi.fn(),
  recordActivity: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business/contact-inbox", () => ({
  contactInboxService: {
    recordCurrentFlowNode: (...args: unknown[]) =>
      mocks.recordCurrentFlowNode(...args),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  contactActivityService: {
    record: (...args: unknown[]) => mocks.recordActivity(...args),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}))

import { recordCurrentFlowNode } from "../src/integration/handlers/current-flow-node"

const conversation = { workspaceId: "ws-1", contactId: "contact-1" }

describe("recordCurrentFlowNode flow-started history", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordCurrentFlowNode.mockResolvedValue(true)
  })

  test("records a flow start when the start node is entered", async () => {
    await recordCurrentFlowNode({
      conversation,
      contactInbox: { id: "ci-1", currentFlowId: "flow-1" },
      flowId: "flow-1",
      nodeId: "start",
      isStartNode: true,
    })
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      type: "flowStarted",
      actor: { type: "bot" },
      payload: { flowId: "flow-1", nodeId: "start" },
    })
  })

  test("records a flow start when the contact moves into another flow", async () => {
    await recordCurrentFlowNode({
      conversation,
      contactInbox: { id: "ci-1", currentFlowId: "flow-1" },
      flowId: "flow-2",
      nodeId: "n5",
    })
    expect(mocks.recordActivity).toHaveBeenCalledTimes(1)
  })

  test("does not record a step inside the same flow", async () => {
    await recordCurrentFlowNode({
      conversation,
      contactInbox: { id: "ci-1", currentFlowId: "flow-1" },
      flowId: "flow-1",
      nodeId: "n2",
    })
    expect(mocks.recordActivity).not.toHaveBeenCalled()
  })

  test("does not record when the position write was throttled", async () => {
    mocks.recordCurrentFlowNode.mockResolvedValue(false)
    await recordCurrentFlowNode({
      conversation,
      contactInbox: { id: "ci-1", currentFlowId: null },
      flowId: "flow-1",
      nodeId: "start",
      isStartNode: true,
    })
    expect(mocks.recordActivity).not.toHaveBeenCalled()
  })

  test("never throws when bookkeeping fails", async () => {
    mocks.recordCurrentFlowNode.mockRejectedValue(new Error("db down"))
    await expect(
      recordCurrentFlowNode({
        conversation,
        contactInbox: { id: "ci-1" },
        flowId: "flow-1",
        nodeId: "start",
        isStartNode: true,
      }),
    ).resolves.toBeUndefined()
    expect(mocks.loggerError).toHaveBeenCalled()
  })
})
