// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  importFlowExport: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  flowService: { importFlowExport: mocks.importFlowExport },
  customFieldService: { invalidate: mocks.invalidate },
}))

const { importFlowFromExport } = await import(
  "@/features/flows/lib/flow-import"
)

const validExport = {
  formatVersion: 2,
  exportedAt: "2026-01-01T00:00:00.000Z",
  source: { workspaceId: "1", flowId: "2" },
  flows: [
    {
      name: "Imported",
      active: true,
      enableInInbox: false,
      startNodeId: "start",
      nodes: [],
      edges: [],
    },
  ],
  customFields: { "99": { name: "plan", type: "shortText" } },
}

describe("importFlowFromExport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("rejects an unsupported format version with a 422", async () => {
    await expect(
      importFlowFromExport({
        workspaceId: "ws-1",
        data: { ...validExport, formatVersion: 1 },
      }),
    ).rejects.toMatchObject({
      httpStatusCode: 422,
      message: "Unsupported export format version: 1",
    })
    expect(mocks.importFlowExport).not.toHaveBeenCalled()
  })

  test("imports through flowService.importFlowExport and invalidates created custom fields", async () => {
    mocks.importFlowExport.mockResolvedValueOnce({
      flowId: "flow-9",
      createdCustomFieldIds: ["cf-1"],
    })

    await expect(
      importFlowFromExport({
        workspaceId: "ws-1",
        data: validExport,
        folderId: "folder-1",
      }),
    ).resolves.toEqual({ flowId: "flow-9", warnings: [] })

    expect(mocks.importFlowExport).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        name: "Imported",
        startNodeId: "start",
        customFields: validExport.customFields,
        folderId: "folder-1",
      }),
    )
    expect(mocks.invalidate).toHaveBeenCalledWith({ workspaceId: "ws-1" })
  })

  test("skips cache invalidation when no custom field was created", async () => {
    mocks.importFlowExport.mockResolvedValueOnce({
      flowId: "flow-9",
      createdCustomFieldIds: [],
    })

    await importFlowFromExport({ workspaceId: "ws-1", data: validExport })

    expect(mocks.invalidate).not.toHaveBeenCalled()
  })
})
