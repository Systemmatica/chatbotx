// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  findBy: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  flowService: { exists: mocks.exists },
  customFieldService: { findBy: mocks.findBy },
}))

const { assertReflinkTargetsInWorkspace } = await import(
  "@/features/reflinks/actions/utils"
)

describe("assertReflinkTargetsInWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exists.mockResolvedValue(true)
    mocks.findBy.mockResolvedValue({ id: "cf-1" })
  })

  test("accepts a flow and custom field of the same workspace", async () => {
    await expect(
      assertReflinkTargetsInWorkspace({
        workspaceId: "ws-1",
        flowId: "flow-1",
        customFieldId: "cf-1",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.exists).toHaveBeenCalledWith("ws-1", "flow-1")
    expect(mocks.findBy).toHaveBeenCalledWith({
      where: { id: "cf-1", workspaceId: "ws-1" },
    })
  })

  test("rejects a flow from another workspace", async () => {
    mocks.exists.mockResolvedValueOnce(false)

    await expect(
      assertReflinkTargetsInWorkspace({ workspaceId: "ws-1", flowId: "x" }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })

  test("rejects a custom field from another workspace", async () => {
    mocks.findBy.mockResolvedValueOnce(undefined)

    await expect(
      assertReflinkTargetsInWorkspace({
        workspaceId: "ws-1",
        customFieldId: "x",
      }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })

  test("skips lookups for fields that are not being set", async () => {
    await assertReflinkTargetsInWorkspace({
      workspaceId: "ws-1",
      customFieldId: null,
    })

    expect(mocks.exists).not.toHaveBeenCalled()
    expect(mocks.findBy).not.toHaveBeenCalled()
  })
})
