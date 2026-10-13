import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  broadcastToWorkspaceParty: vi.fn(),
  resolveTenantSettings: vi.fn(),
  resolveBroadcastSecret: vi.fn(),
}))

vi.mock("@chatbotx.io/partysocket-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/partysocket-config")>()
  return {
    ...actual,
    broadcastToWorkspaceParty: mocks.broadcastToWorkspaceParty,
  }
})

vi.mock("../settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
  resolveBroadcastSecret: mocks.resolveBroadcastSecret,
}))

const { publishContactTagsChanged } = await import("../realtime-broadcast")

describe("publishContactTagsChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveTenantSettings.mockResolvedValue({ wsUrl: "http://ws.test" })
    mocks.resolveBroadcastSecret.mockReturnValue("secret")
    mocks.broadcastToWorkspaceParty.mockResolvedValue(null)
  })

  test("broadcasts contactTagsChanged to the workspace party", async () => {
    await publishContactTagsChanged({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["t-1", "t-2"],
    })

    expect(mocks.broadcastToWorkspaceParty).toHaveBeenCalledWith(
      { url: "http://ws.test", secret: "secret" },
      "ws-1",
      {
        eventType: "contactTagsChanged",
        data: { contactId: "c-1", tagIds: ["t-1", "t-2"] },
      },
    )
  })

  test("does nothing when no tag changed", async () => {
    await publishContactTagsChanged({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: [],
    })

    expect(mocks.resolveTenantSettings).not.toHaveBeenCalled()
    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
  })

  test("never throws, so tag writes are not failed by realtime", async () => {
    mocks.resolveTenantSettings.mockRejectedValue(new Error("no tenant"))

    await expect(
      publishContactTagsChanged({
        workspaceId: "ws-1",
        contactId: "c-1",
        tagIds: ["t-1"],
      }),
    ).resolves.toBeUndefined()
    expect(mocks.broadcastToWorkspaceParty).not.toHaveBeenCalled()
  })
})
