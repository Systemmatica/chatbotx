import { beforeEach, describe, expect, test, vi } from "vitest"

const integrationQueueAdd = vi.fn(async () => ({ id: "job-1" }))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { updateContactAvatar: "updateContactAvatar" },
  integrationQueue: { add: integrationQueueAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const {
  isStaleAvatar,
  needsProfileRefresh,
  PROFILE_REFRESH_INTERVAL_MS,
  scheduleProfileRefreshIfNeeded,
} = await import("../src/integration/handlers/contact/profile-refresh")

const STALE_URL =
  "https://api.telegram.org/file/botFAKE-TOKEN/photos/file_1.jpg"
const MIRRORED_PATH = "public/ws/ws-1/2026/10/13/avatars/abc"

const baseProps = {
  workspaceId: "ws-1",
  contactInboxId: "ci-1",
  sourceId: "100",
}

describe("profile refresh", () => {
  beforeEach(() => {
    integrationQueueAdd.mockClear()
  })

  test("detects legacy token-bearing avatar URLs as stale", () => {
    expect(isStaleAvatar(STALE_URL)).toBe(true)
    expect(isStaleAvatar(MIRRORED_PATH)).toBe(false)
    expect(isStaleAvatar(null)).toBe(false)
  })

  test("refreshes only telegram contacts with a missing or stale avatar", () => {
    expect(needsProfileRefresh("telegram", { avatar: null })).toBe(true)
    expect(needsProfileRefresh("telegram", { avatar: STALE_URL })).toBe(true)
    expect(needsProfileRefresh("telegram", { avatar: MIRRORED_PATH })).toBe(
      false,
    )
    expect(needsProfileRefresh("messenger", { avatar: null })).toBe(false)
  })

  test("enqueues a throttled avatar job keyed by contact inbox", async () => {
    await scheduleProfileRefreshIfNeeded({
      ...baseProps,
      channel: "telegram",
      contact: { avatar: STALE_URL },
    })

    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "updateContactAvatar",
      {
        type: "updateContactAvatar",
        data: { workspaceId: "ws-1", contactInboxId: "ci-1", sourceId: "100" },
      },
      expect.objectContaining({
        deduplication: {
          id: "refresh-profile-ci-1",
          ttl: PROFILE_REFRESH_INTERVAL_MS,
        },
      }),
    )
  })

  test("does nothing when the avatar is already mirrored", async () => {
    await scheduleProfileRefreshIfNeeded({
      ...baseProps,
      channel: "telegram",
      contact: { avatar: MIRRORED_PATH },
    })

    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("never throws when the enqueue fails", async () => {
    integrationQueueAdd.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      scheduleProfileRefreshIfNeeded({
        ...baseProps,
        channel: "telegram",
        contact: { avatar: null },
      }),
    ).resolves.toBeUndefined()
  })
})
