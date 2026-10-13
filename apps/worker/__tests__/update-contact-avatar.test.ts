import { beforeEach, describe, expect, test, vi } from "vitest"

// Covers the avatar/bio write rules of the `updateContactAvatar` job: a valid
// avatar is never overwritten, a missing or stale (token-bearing channel URL)
// avatar is replaced, and bio is only filled when empty. The DB is mocked;
// assertions are on the `.set()` payloads.

const STALE_URL =
  "https://api.telegram.org/file/botFAKE-TOKEN/photos/file_1.jpg"

const state = {
  contact: null as {
    id: string
    avatar: string | null
    bio: string | null
  } | null,
  profile: undefined as { avatar?: string; bio?: string } | undefined,
}

const setCalls: Record<string, unknown>[] = []
const update = vi.fn(() => ({
  set: (values: Record<string, unknown>) => {
    setCalls.push(values)
    return { where: vi.fn(async () => undefined) }
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactInboxModel: {
        findFirst: vi.fn(async () => ({
          id: "ci-1",
          contactId: "c-1",
          channel: "telegram",
        })),
      },
      contactModel: { findFirst: vi.fn(async () => state.contact) },
    },
    update,
  },
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { id: "id", avatar: "avatar", bio: "bio" },
}))

const runChannelHandler = vi.fn(async () => state.profile)
vi.mock("../src/services/integrations", () => ({
  allIntegrations: { telegram: { runChannelHandler } },
  resolveIntegrationContextFromContactInbox: vi.fn(async () => ({ ctx: {} })),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { updateContactAvatar: "updateContactAvatar" },
  integrationQueue: { add: vi.fn() },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { updateContactAvatar } = await import(
  "../src/integration/handlers/contact/update-avatar"
)

const run = () =>
  updateContactAvatar({
    workspaceId: "ws-1",
    contactInboxId: "ci-1",
    sourceId: "100",
  })

describe("updateContactAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCalls.length = 0
  })

  test("skips the channel call when a mirrored avatar is already stored", async () => {
    state.contact = { id: "c-1", avatar: "public/ws/1/avatars/a", bio: null }

    await run()

    expect(runChannelHandler).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  test("replaces a stale token-bearing avatar URL and fills an empty bio", async () => {
    state.contact = { id: "c-1", avatar: STALE_URL, bio: null }
    state.profile = { avatar: "public/ws/1/avatars/new", bio: "Hello" }

    await run()

    expect(setCalls).toEqual([
      expect.objectContaining({ bio: "Hello" }),
      expect.objectContaining({ avatar: "public/ws/1/avatars/new" }),
    ])
  })

  test("drops a stale avatar URL when the channel no longer exposes a photo", async () => {
    state.contact = { id: "c-1", avatar: STALE_URL, bio: "kept" }
    state.profile = { bio: "new bio" }

    await run()

    expect(setCalls).toEqual([expect.objectContaining({ avatar: null })])
  })

  test("fills a missing avatar", async () => {
    state.contact = { id: "c-1", avatar: null, bio: null }
    state.profile = { avatar: "public/ws/1/avatars/new" }

    await run()

    expect(setCalls).toEqual([
      expect.objectContaining({ avatar: "public/ws/1/avatars/new" }),
    ])
  })
})
