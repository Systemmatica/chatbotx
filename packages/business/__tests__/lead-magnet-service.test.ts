import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  isUniqueViolationError: vi.fn((_error: unknown) => false),
  findById: vi.fn(),
  findByName: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  findOrCreateTagFolder: vi.fn(),
  findOrCreateTag: vi.fn(),
  findLiveTag: vi.fn(),
  findLiveTagByName: vi.fn(),
  renameTag: vi.fn(),
  enqueueCreate: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  leadMagnetRepository: {
    findById: mocks.findById,
    findByName: mocks.findByName,
    insert: mocks.insert,
    update: mocks.update,
    findOrCreateTagFolder: mocks.findOrCreateTagFolder,
    findOrCreateTag: mocks.findOrCreateTag,
    findLiveTag: mocks.findLiveTag,
    findLiveTagByName: mocks.findLiveTagByName,
    renameTag: mocks.renameTag,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: { enqueueCreate: mocks.enqueueCreate },
}))

const { LEAD_MAGNET_TAG_FOLDER_NAME } = await import(
  "@chatbotx.io/database/partials"
)
const { leadMagnetService } = await import("../src/lead-magnet/service")

const leadMagnet = (overrides: Record<string, unknown> = {}) => ({
  id: "lm-1",
  workspaceId: "ws-1",
  name: "Книга",
  kind: "book",
  url: null,
  description: null,
  tagId: "tag-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe("leadMagnetService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isUniqueViolationError.mockReturnValue(false)
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
    mocks.findByName.mockResolvedValue(undefined)
    mocks.findOrCreateTagFolder.mockResolvedValue("folder-1")
    mocks.insert.mockImplementation(async (values: Record<string, unknown>) =>
      leadMagnet(values),
    )
  })

  test("creates the 'ЛМ: <name>' tag in the lead magnet folder and links it", async () => {
    mocks.findOrCreateTag.mockResolvedValue({ id: "tag-9", created: true })

    const created = await leadMagnetService.create({
      workspaceId: "ws-1",
      name: "  Чек-лист запуска  ",
      kind: "checklist",
      url: "  ",
      description: "Первые шаги",
    })

    expect(mocks.findOrCreateTagFolder).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: LEAD_MAGNET_TAG_FOLDER_NAME,
      tx: "tx",
    })
    expect(mocks.findOrCreateTag).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "ЛМ: Чек-лист запуска",
      folderId: "folder-1",
      tx: "tx",
    })
    expect(mocks.insert).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Чек-лист запуска",
      kind: "checklist",
      url: null,
      description: "Первые шаги",
      tagId: "tag-9",
      tx: "tx",
    })
    expect(created.tagId).toBe("tag-9")
    // A new tag is synced to channels and the tag caches are dropped.
    expect(mocks.enqueueCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tagId: "tag-9",
    })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalled()
  })

  test("reuses an existing tag without re-syncing it", async () => {
    mocks.findOrCreateTag.mockResolvedValue({ id: "tag-old", created: false })

    const created = await leadMagnetService.create({
      workspaceId: "ws-1",
      name: "Рилс",
      kind: "video",
    })

    expect(created.tagId).toBe("tag-old")
    expect(mocks.enqueueCreate).not.toHaveBeenCalled()
  })

  test("rejects a name already used in the workspace", async () => {
    mocks.findByName.mockResolvedValue(leadMagnet())

    await expect(
      leadMagnetService.create({
        workspaceId: "ws-1",
        name: "Книга",
        kind: "book",
      }),
    ).rejects.toMatchObject({ httpStatusCode: 409 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("maps a unique violation from a concurrent create to 409", async () => {
    mocks.findOrCreateTag.mockResolvedValue({ id: "tag-1", created: false })
    mocks.insert.mockRejectedValue(new Error("duplicate key"))
    mocks.isUniqueViolationError.mockReturnValue(true)

    await expect(
      leadMagnetService.create({
        workspaceId: "ws-1",
        name: "Книга",
        kind: "book",
      }),
    ).rejects.toMatchObject({ httpStatusCode: 409 })
  })
})

describe("leadMagnetService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isUniqueViolationError.mockReturnValue(false)
    mocks.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => await fn("tx"),
    )
    mocks.findByName.mockResolvedValue(undefined)
    mocks.findOrCreateTagFolder.mockResolvedValue("folder-1")
    mocks.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => leadMagnet(data),
    )
  })

  test("renaming renames the live tag", async () => {
    mocks.findById.mockResolvedValue(leadMagnet())
    mocks.findLiveTag.mockResolvedValue({ id: "tag-1", name: "ЛМ: Книга" })
    mocks.findLiveTagByName.mockResolvedValue(undefined)

    await leadMagnetService.update({
      workspaceId: "ws-1",
      id: "lm-1",
      name: "Книга 2.0",
    })

    expect(mocks.renameTag).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "tag-1",
      name: "ЛМ: Книга 2.0",
      tx: "tx",
    })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Книга 2.0" } }),
    )
  })

  test("re-creates a deleted tag and relinks it", async () => {
    mocks.findById.mockResolvedValue(leadMagnet({ tagId: null }))
    mocks.findOrCreateTag.mockResolvedValue({ id: "tag-new", created: true })

    await leadMagnetService.update({
      workspaceId: "ws-1",
      id: "lm-1",
      kind: "article",
    })

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { kind: "article", tagId: "tag-new" } }),
    )
    expect(mocks.enqueueCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tagId: "tag-new",
    })
  })

  test("rejects renaming onto another lead magnet's name", async () => {
    mocks.findById.mockResolvedValue(leadMagnet())
    mocks.findByName.mockResolvedValue(leadMagnet({ id: "lm-2" }))

    await expect(
      leadMagnetService.update({ workspaceId: "ws-1", id: "lm-1", name: "Б" }),
    ).rejects.toMatchObject({ httpStatusCode: 409 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
