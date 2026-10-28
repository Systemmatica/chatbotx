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
  folderService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    ensureExists: vi.fn(),
    findOrFail: vi.fn(),
    bulkDelete: vi.fn(),
    changeFolder: vi.fn(),
  },
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@chatbotx.io/business", () => ({
  folderService: mocks.folderService,
}))

await import("@/features/folders/api/workspace-token")

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /v1/folders", () => {
  const procedure = findProcedure("GET", "/v1/folders")

  test("lists folders of a type in the token workspace", async () => {
    mocks.folderService.list.mockResolvedValueOnce([{ id: "f-1" }])

    await expect(
      procedure.handler?.({
        context,
        input: { folderType: "flow", parentId: "0" },
      }),
    ).resolves.toEqual({ data: [{ id: "f-1" }] })
    expect(mocks.folderService.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      folderType: "flow",
      parentId: "0",
    })
  })
})

describe("POST /v1/folders", () => {
  const procedure = findProcedure("POST", "/v1/folders")

  test("checks the parent folder belongs to the workspace before nesting", async () => {
    mocks.folderService.create.mockResolvedValueOnce({ id: "f-2" })
    const input = { name: "Sub", folderType: "flow", parentId: "f-1" }

    await expect(procedure.handler?.({ context, input })).resolves.toEqual({
      id: "f-2",
    })
    expect(mocks.folderService.ensureExists).toHaveBeenCalledWith({
      id: "f-1",
      workspaceId: "ws-1",
      folderType: "flow",
    })
    expect(mocks.folderService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: input,
    })
  })

  test("does not look up a parent for a root folder", async () => {
    await procedure.handler?.({
      context,
      input: { name: "Root", folderType: "flow", parentId: null },
    })

    expect(mocks.folderService.ensureExists).not.toHaveBeenCalled()
  })

  test("propagates a foreign parent as an error and creates nothing", async () => {
    mocks.folderService.ensureExists.mockRejectedValueOnce(
      new Error("Folder not found"),
    )

    await expect(
      procedure.handler?.({
        context,
        input: { name: "Sub", folderType: "flow", parentId: "foreign" },
      }),
    ).rejects.toThrow("Folder not found")
    expect(mocks.folderService.create).not.toHaveBeenCalled()
  })
})

describe("PATCH /v1/folders/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/folders/{id}")

  test("renames through folderService.update", async () => {
    await procedure.handler?.({ context, input: { id: "f-1", name: "New" } })

    expect(mocks.folderService.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "f-1",
      data: { name: "New" },
    })
  })
})

describe("DELETE /v1/folders/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/folders/{id}")

  test("verifies ownership, then deletes", async () => {
    await procedure.handler?.({ context, input: { id: "f-1" } })

    expect(mocks.folderService.findOrFail).toHaveBeenCalledWith({
      id: "f-1",
      workspaceId: "ws-1",
    })
    expect(mocks.folderService.bulkDelete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["f-1"],
    })
  })
})

describe("POST /v1/folders/move", () => {
  const procedure = findProcedure("POST", "/v1/folders/move")

  test("maps a null folder to the root", async () => {
    await procedure.handler?.({
      context,
      input: { folderType: "tag", ids: ["t-1"], folderId: null },
    })

    expect(mocks.folderService.changeFolder).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      folderType: "tag",
      modelIds: ["t-1"],
      newFolderId: "",
    })
  })
})
