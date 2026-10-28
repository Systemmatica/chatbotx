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
  flowService: { findBy: vi.fn() },
  flowVersionService: { findDraft: vi.fn(), findPublished: vi.fn() },
  folderService: { ensureExists: vi.fn(), changeFolder: vi.fn() },
  flowAnalyticsService: { getFlowStats: vi.fn() },
  createFlow: vi.fn(),
  deleteFlows: vi.fn(),
  publishFlow: vi.fn(),
  updateDraftFlowVersion: vi.fn(),
  updateFlow: vi.fn(),
  buildFlowExport: vi.fn(),
  importFlowFromExport: vi.fn(),
  listFlows: vi.fn(),
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@chatbotx.io/business", () => ({
  flowService: mocks.flowService,
  flowVersionService: mocks.flowVersionService,
  folderService: mocks.folderService,
}))
vi.mock("@chatbotx.io/analytics", () => ({
  flowAnalyticsService: mocks.flowAnalyticsService,
  flowNodeStatsResponse: {},
}))
vi.mock("@/features/flows/actions/create-flow-action", () => ({
  createFlow: mocks.createFlow,
}))
vi.mock("@/features/flows/actions/delete-flow.action", () => ({
  deleteFlows: mocks.deleteFlows,
}))
vi.mock("@/features/flows/actions/publish-flow-action", () => ({
  publishFlow: mocks.publishFlow,
}))
vi.mock("@/features/flows/actions/update-draft-flow-version-action", () => ({
  updateDraftFlowVersion: mocks.updateDraftFlowVersion,
}))
vi.mock("@/features/flows/actions/update-flow-action", () => ({
  updateFlow: mocks.updateFlow,
}))
vi.mock("@/features/flows/lib/flow-export", () => ({
  buildFlowExport: mocks.buildFlowExport,
}))
vi.mock("@/features/flows/lib/flow-import", () => ({
  importFlowFromExport: mocks.importFlowFromExport,
}))
vi.mock("@/features/flows/queries", () => ({ listFlows: mocks.listFlows }))

await import("@/features/flows/api/workspace-token")

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
const flow = { id: "flow-1", workspaceId: "ws-1", name: "Welcome" }
const draft = {
  id: "draft-1",
  flowId: "flow-1",
  nodes: [{ id: "n1" }],
  edges: [],
}
const published = { id: "v-1", flowId: "flow-1", nodes: [], edges: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.flowService.findBy.mockResolvedValue(flow)
  mocks.flowVersionService.findDraft.mockResolvedValue(draft)
  mocks.flowVersionService.findPublished.mockResolvedValue(published)
})

describe("GET /v1/flows/{id}", () => {
  const procedure = findProcedure("GET", "/v1/flows/{id}")

  test("returns the flow with its draft and published versions", async () => {
    await expect(
      procedure.handler?.({ context, input: { id: "flow-1" } }),
    ).resolves.toEqual({
      ...flow,
      draftVersion: draft,
      publishedVersion: published,
    })
    expect(mocks.flowService.findBy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "flow-1",
    })
  })

  test("returns null versions when the flow was never published", async () => {
    mocks.flowVersionService.findPublished.mockResolvedValueOnce(undefined)

    const result = await procedure.handler?.({
      context,
      input: { id: "flow-1" },
    })

    expect(result.publishedVersion).toBeNull()
  })

  test("404s for a flow outside the workspace", async () => {
    mocks.flowService.findBy.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "foreign" } }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })
})

describe("POST /v1/flows", () => {
  const procedure = findProcedure("POST", "/v1/flows")

  test("creates through the shared createFlow action logic", async () => {
    mocks.createFlow.mockResolvedValueOnce({ id: "flow-2" })

    await expect(
      procedure.handler?.({
        context,
        input: { name: "New", folderId: null },
      }),
    ).resolves.toEqual({ id: "flow-2" })
    expect(mocks.createFlow).toHaveBeenCalledWith("ws-1", {
      name: "New",
      folderId: null,
    })
    expect(procedure.route.successStatus).toBe(201)
  })
})

describe("PATCH /v1/flows/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/flows/{id}")

  test("updates name/active and returns the fresh flow", async () => {
    await procedure.handler?.({
      context,
      input: { id: "flow-1", active: false },
    })

    expect(mocks.updateFlow).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "flow-1" },
      { active: false },
    )
    expect(mocks.flowService.findBy).toHaveBeenCalled()
  })
})

describe("DELETE /v1/flows/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/flows/{id}")

  test("deletes the flow", async () => {
    mocks.deleteFlows.mockResolvedValueOnce(["flow-1"])

    await procedure.handler?.({ context, input: { id: "flow-1" } })

    expect(mocks.deleteFlows).toHaveBeenCalledWith("ws-1", ["flow-1"])
  })

  test("404s when nothing was deleted", async () => {
    mocks.deleteFlows.mockResolvedValueOnce([])

    await expect(
      procedure.handler?.({ context, input: { id: "flow-1" } }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })
})

describe("GET /v1/flows/{id}/export", () => {
  const procedure = findProcedure("GET", "/v1/flows/{id}/export")

  test("returns the export envelope", async () => {
    const envelope = { formatVersion: 2, flows: [] }
    mocks.buildFlowExport.mockResolvedValueOnce({
      status: "ok",
      envelope,
      fileName: "x.json",
    })

    await expect(
      procedure.handler?.({ context, input: { id: "flow-1" } }),
    ).resolves.toBe(envelope)
    expect(mocks.buildFlowExport).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "flow-1",
    })
  })

  test("409s when the flow is not published", async () => {
    mocks.buildFlowExport.mockResolvedValueOnce({ status: "notPublished" })

    await expect(
      procedure.handler?.({ context, input: { id: "flow-1" } }),
    ).rejects.toMatchObject({ httpStatusCode: 409, code: "notPublished" })
  })
})

describe("POST /v1/flows/import", () => {
  const procedure = findProcedure("POST", "/v1/flows/import")

  test("checks the folder belongs to the workspace, then imports", async () => {
    mocks.importFlowFromExport.mockResolvedValueOnce({
      flowId: "flow-3",
      warnings: [],
    })
    const data = { formatVersion: 2 }

    await expect(
      procedure.handler?.({ context, input: { data, folderId: "folder-1" } }),
    ).resolves.toEqual({ flowId: "flow-3", warnings: [] })

    expect(mocks.folderService.ensureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "ws-1",
      folderType: "flow",
    })
    expect(mocks.importFlowFromExport).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data,
      folderId: "folder-1",
    })
  })
})

describe("PUT /v1/flows/{id}/draft", () => {
  const procedure = findProcedure("PUT", "/v1/flows/{id}/draft")

  test("writes the draft version of the flow", async () => {
    const nodes = [{ id: "n2" }]

    await procedure.handler?.({
      context,
      input: { id: "flow-1", nodes, edges: [] },
    })

    expect(mocks.updateDraftFlowVersion).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "draft-1" },
      { nodes, edges: [] },
    )
  })
})

describe("POST /v1/flows/{id}/publish", () => {
  const procedure = findProcedure("POST", "/v1/flows/{id}/publish")

  test("publishes the stored draft when no graph is given", async () => {
    await procedure.handler?.({ context, input: { id: "flow-1" } })

    expect(mocks.publishFlow).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "flow-1" },
      { nodes: draft.nodes, edges: draft.edges },
    )
  })

  test("publishes the graph from the body when given", async () => {
    const nodes = [{ id: "n9" }]

    await procedure.handler?.({
      context,
      input: { id: "flow-1", nodes, edges: [] },
    })

    expect(mocks.publishFlow).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "flow-1" },
      { nodes, edges: [] },
    )
    expect(mocks.flowVersionService.findDraft).toHaveBeenCalledTimes(1)
  })
})

describe("PUT /v1/flows/{id}/folder", () => {
  const procedure = findProcedure("PUT", "/v1/flows/{id}/folder")

  test("moves the flow through folderService.changeFolder", async () => {
    await procedure.handler?.({
      context,
      input: { id: "flow-1", folderId: null },
    })

    expect(mocks.folderService.changeFolder).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      folderType: "flow",
      modelIds: ["flow-1"],
      newFolderId: "",
    })
  })
})

describe("GET /v1/flows/{id}/stats", () => {
  const procedure = findProcedure("GET", "/v1/flows/{id}/stats")

  test("returns node stats scoped to the workspace", async () => {
    mocks.flowAnalyticsService.getFlowStats.mockResolvedValueOnce({ n1: {} })

    await expect(
      procedure.handler?.({ context, input: { id: "flow-1" } }),
    ).resolves.toEqual({ n1: {} })
    expect(mocks.flowAnalyticsService.getFlowStats).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "flow-1",
    })
  })
})
