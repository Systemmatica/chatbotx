// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindFirst,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockUpdateWebhookCache,
  mockRecordAuditLog,
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })
  return {
    mockFindFirst: vi.fn(),
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockUpdateWebhookCache: vi.fn().mockResolvedValue(undefined),
    mockRecordAuditLog: vi.fn(),
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: (...args: unknown[]) => mockRecordAuditLog(...args) },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { webhookModel: { findFirst: mockFindFirst } },
    update: mockUpdate,
  },
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  webhookModel: { id: "id" },
}))

vi.mock("@chatbotx.io/events", () => ({
  updateWebhookCache: mockUpdateWebhookCache,
}))

vi.mock("../src/features/webhooks/schemas/update-webhook-schema", () => ({
  updateWebhookSettingsRequest: {},
}))

const { updateWebhookSettingsAction } = await import(
  "../src/features/webhooks/actions/update-webhook-settings-action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { active: boolean }
}) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdate.mockReturnValue({ set: mockUpdateSet })
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
  mockUpdateWhere.mockResolvedValue(undefined)
  mockFindFirst.mockResolvedValue({
    id: "webhook-1",
    name: "New Order",
    active: false,
  })
})

describe("updateWebhookSettingsAction", () => {
  test("emits an 'enabled' detail when active flips to true", async () => {
    await (updateWebhookSettingsAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { active: true },
    })

    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "update",
      detail: "enabled a webhook (#webhook-1)",
    })
  })

  test("emits a 'disabled' detail when active flips to false", async () => {
    mockFindFirst.mockResolvedValue({
      id: "webhook-1",
      name: "New Order",
      active: true,
    })

    await (updateWebhookSettingsAction as unknown as Handler)({
      bindArgsParsedInputs: ["ws-1", "webhook-1"],
      parsedInput: { active: false },
    })

    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "update",
      detail: "disabled a webhook (#webhook-1)",
    })
  })

  test("throws when the webhook is not found", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(
      (updateWebhookSettingsAction as unknown as Handler)({
        bindArgsParsedInputs: ["ws-1", "missing"],
        parsedInput: { active: true },
      }),
    ).rejects.toThrow("Webhook not found")

    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })
})
