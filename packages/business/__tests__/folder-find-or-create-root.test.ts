import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  })),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  and: vi.fn(),
  arrayContains: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  or: vi.fn(),
  sql: mocks.sql,
}))

const { folderService } = await import("../src/folder/service")

const tx = {
  execute: mocks.execute,
  query: { folderModel: { findFirst: mocks.findFirst } },
  insert: vi.fn(() => ({
    values: (values: unknown) => {
      mocks.insertValues(values)
      return { returning: mocks.insertReturning }
    },
  })),
}

describe("folderService.findOrCreateRootByName", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the existing root folder without creating one", async () => {
    mocks.findFirst.mockResolvedValue({ id: "folder-1", name: "Рассылки" })

    const folder = await folderService.findOrCreateRootByName({
      workspaceId: "ws-1",
      folderType: "flow",
      name: "Рассылки",
      tx: tx as never,
    })

    expect(folder).toEqual({ id: "folder-1", name: "Рассылки" })
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.sql.mock.calls[0][1]).toBe("folder-root:ws-1:flow:Рассылки")
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "ws-1",
          folderType: "flow",
          name: "Рассылки",
          isTrash: false,
          parentId: { isNull: true },
        },
      }),
    )
    expect(mocks.insertValues).not.toHaveBeenCalled()
  })

  test("creates the root folder under the lock when missing", async () => {
    mocks.findFirst.mockResolvedValue(undefined)
    mocks.insertReturning.mockResolvedValue([{ id: "folder-new" }])

    const folder = await folderService.findOrCreateRootByName({
      workspaceId: "ws-1",
      folderType: "flow",
      name: "Рассылки",
      tx: tx as never,
    })

    expect(folder).toEqual({ id: "folder-new" })
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insertValues.mock.invocationCallOrder[0],
    )
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        name: "Рассылки",
        folderType: "flow",
        parentId: null,
        paths: [],
      }),
    )
  })
})
