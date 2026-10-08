import { BROADCAST_TEXT_FLOW_FOLDER_NAME } from "@chatbotx.io/database/partials"
import {
  sendMessageNodeSchema,
  sendTextValidator,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  findOrCreateRootByName: vi.fn(),
  createPublishedDefault: vi.fn(),
  invalidateList: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  and: vi.fn(),
  asc: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
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

vi.mock("../src/folder/service", () => ({
  folderService: { findOrCreateRootByName: mocks.findOrCreateRootByName },
}))

vi.mock("../src/flow/service", () => ({
  flowService: { createPublishedDefault: mocks.createPublishedDefault },
}))

vi.mock("../src/flow-version", () => ({
  flowVersionService: { invalidateList: mocks.invalidateList },
}))

const { broadcastService } = await import("../src/broadcast/service")
const { buildBroadcastTextFlowNode, buildBroadcastTextName } = await import(
  "../src/broadcast/text-message"
)

const tx = {
  insert: vi.fn(() => ({
    values: (values: unknown) => {
      mocks.insertValues(values)
      return { returning: mocks.insertReturning }
    },
  })),
}

const baseValues = {
  channel: "telegram" as const,
  subaction: "telegramAllContacts",
  schedulesType: "now" as const,
  schedulesAt: new Date("2026-10-08T10:00:00.000Z"),
  contactFilter: { operator: "and" as const, conditions: [] },
  status: "scheduled" as const,
}

describe("broadcastService.createWithTextMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (fn: (client: unknown) => unknown) => await fn(tx),
    )
    mocks.findOrCreateRootByName.mockResolvedValue({ id: "folder-1" })
    mocks.createPublishedDefault.mockResolvedValue({
      flowId: "flow-1",
      draftVersionId: "draft-1",
      publishedVersionId: "published-1",
    })
    mocks.insertReturning.mockResolvedValue([
      { id: "broadcast-1", flowId: "flow-1" },
    ])
  })

  test("creates a published service flow in the broadcasts folder and a broadcast pointing at it", async () => {
    const result = await broadcastService.createWithTextMessage({
      workspaceId: "workspace-1",
      textMessage: {
        text: "<b>Ребята, привет!</b> Вы остановились на этом шаге",
        version: "v2",
        buttons: [{ label: "Продолжить", url: "https://example.com/step" }],
      },
      values: baseValues,
    })

    expect(result).toEqual({ id: "broadcast-1", flowId: "flow-1" })

    expect(mocks.findOrCreateRootByName).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      folderType: "flow",
      name: BROADCAST_TEXT_FLOW_FOLDER_NAME,
      tx,
    })

    expect(mocks.createPublishedDefault).toHaveBeenCalledTimes(1)
    const [flowTx, flowInput] = mocks.createPublishedDefault.mock.calls[0]
    expect(flowTx).toBe(tx)
    expect(flowInput).toMatchObject({
      workspaceId: "workspace-1",
      folderId: "folder-1",
      name: "Ребята, привет! Вы остановились на этом шаге",
      edges: [],
    })
    expect(flowInput.nodes).toHaveLength(1)
    expect(flowInput.startNodeId).toBe(flowInput.nodes[0].id)
    expect(flowInput.nodes[0].data.details.steps).toEqual([
      expect.objectContaining({
        stepType: "sendText",
        version: "v2",
        text: "<b>Ребята, привет!</b> Вы остановились на этом шаге",
        buttons: [
          expect.objectContaining({
            label: "Продолжить",
            buttonType: "openWebsite",
            beforeStep: expect.objectContaining({
              stepType: "openWebsite",
              url: "https://example.com/step",
            }),
            steps: [],
          }),
        ],
      }),
    ])

    expect(mocks.insertValues).toHaveBeenCalledWith({
      ...baseValues,
      workspaceId: "workspace-1",
      flowId: "flow-1",
      name: "Ребята, привет! Вы остановились на этом шаге",
      templateId: null,
      templateData: null,
    })

    expect(mocks.invalidateList).toHaveBeenCalledWith("flow-1")
  })

  test("does not invalidate the flow cache when the transaction fails", async () => {
    mocks.insertReturning.mockRejectedValue(new Error("insert failed"))

    await expect(
      broadcastService.createWithTextMessage({
        workspaceId: "workspace-1",
        textMessage: { text: "Hi", version: "v2", buttons: [] },
        values: baseValues,
      }),
    ).rejects.toThrow("insert failed")

    expect(mocks.invalidateList).not.toHaveBeenCalled()
  })
})

describe("buildBroadcastTextFlowNode", () => {
  test("produces a node accepted by the flow publish schemas", () => {
    const node = buildBroadcastTextFlowNode({
      text: "Привет, <i>{{first_name}}</i>!",
      version: "v2",
      buttons: [
        { label: "Сайт", url: "https://example.com" },
        { label: "Запись", url: "{{booking_link}}" },
      ],
    })

    expect(sendMessageNodeSchema.safeParse(node).success).toBe(true)
    const [step] = node.data.details.steps
    expect(sendTextValidator.omnichannel.safeParse(step).success).toBe(true)
    expect(node.data.isStartNode).toBe(true)
  })

  test("defaults to rich text v2 and no buttons", () => {
    const node = buildBroadcastTextFlowNode({ text: "Hello" })
    const [step] = node.data.details.steps
    expect(step).toMatchObject({ version: "v2", buttons: [] })
  })
})

describe("buildBroadcastTextName", () => {
  test("collapses whitespace and truncates long text", () => {
    const name = buildBroadcastTextName({
      text: `Line one\n\n${"x".repeat(100)}`,
      version: "v2",
    })
    expect(name.startsWith("Line one x")).toBe(true)
    expect(Array.from(name)).toHaveLength(60)
    expect(name.endsWith("…")).toBe(true)
  })
})
