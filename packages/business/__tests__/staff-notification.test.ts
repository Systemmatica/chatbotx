import { describe, expect, test } from "vitest"
import {
  claimIncomingMessageNotification,
  claimStuckNotification,
  INCOMING_MESSAGE_DEBOUNCE_SECONDS,
  incomingMessageClaimKey,
  stuckClaimKey,
} from "../src/staff-notification/claims"
import {
  deriveStaffNotifierWebhookSecret,
  safeEqual,
} from "../src/staff-notification/config"
import {
  escapeHtml,
  formatStuckDuration,
  pluralRu,
  renderContactStuck,
  renderContactStuckSummary,
  renderIncomingMessage,
  renderStepReached,
  resolveStaffMessageLocale,
  type StaffMessageContext,
  truncateText,
} from "../src/staff-notification/format"
import {
  consumeStaffLinkCode,
  generateStaffLinkCode,
  issueStaffLinkCode,
  isWellFormedStaffLinkCode,
  parseStartCommand,
  STAFF_LINK_CODE_TTL_SECONDS,
  staffLinkCodeKey,
} from "../src/staff-notification/link-code"
import {
  isStaffRecipient,
  resolveStaffNotificationTypes,
  type StaffRecipientCandidate,
  selectStaffRecipients,
} from "../src/staff-notification/preferences"
import type { StaffNotifierStore } from "../src/staff-notification/store"
import {
  clampStuckHours,
  computeStuckScanWindow,
  groupStuckRows,
  isInStuckWindow,
  planStuckEvents,
  STUCK_SCAN_LOOKBACK_MS,
  type StuckRow,
} from "../src/staff-notification/stuck"
import { StaffNotifierTelegramError } from "../src/staff-notification/telegram-api"

const LINK_CODE_SHAPE = /^[A-Za-z0-9_-]{16}$/
const ANY_TAG = /<\/?[a-z]+[^>]*>/g
const OWN_TAG = /^<\/?(b|a)( href="[^"]*")?>$/
const QUOTED_PREVIEW = /«(я+)…»/
const HEX_SECRET = /^[0-9a-f]{64}$/

/** In-memory stand-in for Redis SET NX EX / MULTI GET+DEL with a fake clock. */
function createFakeStore() {
  let now = 0
  const entries = new Map<string, { value: string; expiresAt: number }>()
  const live = (key: string) => {
    const entry = entries.get(key)
    if (entry && entry.expiresAt <= now) {
      entries.delete(key)
      return
    }
    return entry
  }
  const store: StaffNotifierStore = {
    setIfAbsent(key, value, ttlSeconds) {
      if (live(key)) {
        return Promise.resolve(false)
      }
      entries.set(key, { value, expiresAt: now + ttlSeconds * 1000 })
      return Promise.resolve(true)
    },
    take(key) {
      const entry = live(key)
      entries.delete(key)
      return Promise.resolve(entry?.value ?? null)
    },
    delete(key) {
      entries.delete(key)
      return Promise.resolve()
    },
  }
  return {
    store,
    entries,
    advance(ms: number) {
      now += ms
    },
  }
}

const payload = {
  workspaceMemberId: "11",
  workspaceId: "22",
  userId: "33",
}

describe("staff link codes", () => {
  test("generates url-safe 16-char codes", () => {
    const code = generateStaffLinkCode()
    expect(code).toMatch(LINK_CODE_SHAPE)
    expect(isWellFormedStaffLinkCode(code)).toBe(true)
    expect(generateStaffLinkCode()).not.toBe(code)
  })

  test("a code is redeemed once and binds the issuing member", async () => {
    const { store } = createFakeStore()
    const { code, expiresAt } = await issueStaffLinkCode(store, payload, {
      now: new Date(0),
    })
    expect(expiresAt.getTime()).toBe(STAFF_LINK_CODE_TTL_SECONDS * 1000)

    await expect(consumeStaffLinkCode(store, code)).resolves.toEqual(payload)
    // Single use: the second redemption finds nothing.
    await expect(consumeStaffLinkCode(store, code)).resolves.toBeNull()
  })

  test("an expired code is rejected", async () => {
    const fake = createFakeStore()
    const { code } = await issueStaffLinkCode(fake.store, payload)
    fake.advance(STAFF_LINK_CODE_TTL_SECONDS * 1000)
    await expect(consumeStaffLinkCode(fake.store, code)).resolves.toBeNull()
  })

  test("a code still valid just before expiry works", async () => {
    const fake = createFakeStore()
    const { code } = await issueStaffLinkCode(fake.store, payload)
    fake.advance(STAFF_LINK_CODE_TTL_SECONDS * 1000 - 1)
    await expect(consumeStaffLinkCode(fake.store, code)).resolves.toEqual(
      payload,
    )
  })

  test("malformed or unknown codes never hit a stored binding", async () => {
    const fake = createFakeStore()
    await fake.store.setIfAbsent(staffLinkCodeKey("x"), "{}", 60)
    await expect(consumeStaffLinkCode(fake.store, "x")).resolves.toBeNull()
    await expect(
      consumeStaffLinkCode(fake.store, "AAAAAAAAAAAAAAAA"),
    ).resolves.toBeNull()
    await expect(
      consumeStaffLinkCode(fake.store, "../../../../etc/x"),
    ).resolves.toBeNull()
  })

  test("a corrupt stored payload is rejected", async () => {
    const fake = createFakeStore()
    const code = "BBBBBBBBBBBBBBBB"
    await fake.store.setIfAbsent(
      staffLinkCodeKey(code),
      JSON.stringify({ workspaceId: "1" }),
      60,
    )
    await expect(consumeStaffLinkCode(fake.store, code)).resolves.toBeNull()
  })

  test("issuing retries on a collision and never rebinds an existing code", async () => {
    const fake = createFakeStore()
    await fake.store.setIfAbsent(
      staffLinkCodeKey("CCCCCCCCCCCCCCCC"),
      JSON.stringify({ ...payload, workspaceMemberId: "other" }),
      60,
    )
    const codes = ["CCCCCCCCCCCCCCCC", "DDDDDDDDDDDDDDDD"]
    const { code } = await issueStaffLinkCode(fake.store, payload, {
      generate: () => codes.shift() ?? "EEEEEEEEEEEEEEEE",
    })
    expect(code).toBe("DDDDDDDDDDDDDDDD")
    await expect(
      consumeStaffLinkCode(fake.store, "CCCCCCCCCCCCCCCC"),
    ).resolves.toMatchObject({ workspaceMemberId: "other" })
  })

  test("parses /start with and without a payload", () => {
    expect(parseStartCommand("/start abc_DEF-123")).toEqual({
      isStart: true,
      code: "abc_DEF-123",
    })
    expect(parseStartCommand("/start@notify_bot abc")).toEqual({
      isStart: true,
      code: "abc",
    })
    expect(parseStartCommand("/start")).toEqual({ isStart: true, code: null })
    expect(parseStartCommand("hello")).toEqual({ isStart: false, code: null })
    expect(parseStartCommand(undefined)).toEqual({
      isStart: false,
      code: null,
    })
    expect(parseStartCommand("/start a b")).toEqual({
      isStart: false,
      code: null,
    })
  })
})

describe("recipient selection", () => {
  const member = (
    overrides: Partial<StaffRecipientCandidate>,
  ): StaffRecipientCandidate => ({
    id: "1",
    telegramChatId: "100",
    notificationChannels: {},
    notificationTypes: {},
    ...overrides,
  })

  test("missing type keys default to on (old rows, `{}` jsonb)", () => {
    expect(resolveStaffNotificationTypes({})).toEqual({
      newMessageToHuman: true,
      notifyAdmin: true,
      contactStuck: true,
    })
    expect(resolveStaffNotificationTypes(null)).toEqual({
      newMessageToHuman: true,
      notifyAdmin: true,
      contactStuck: true,
    })
    expect(
      resolveStaffNotificationTypes({
        notifyAdmin: true,
        newMessageToHuman: false,
        newOrder: true,
      }),
    ).toEqual({
      newMessageToHuman: false,
      notifyAdmin: true,
      contactStuck: true,
    })
  })

  test("requires a linked chat", () => {
    expect(
      isStaffRecipient(member({ telegramChatId: null }), "notifyAdmin"),
    ).toBe(false)
    expect(isStaffRecipient(member({}), "notifyAdmin")).toBe(true)
  })

  test("respects the Telegram channel switch", () => {
    expect(
      isStaffRecipient(
        member({ notificationChannels: { telegram: false } }),
        "contactStuck",
      ),
    ).toBe(false)
    expect(
      isStaffRecipient(
        member({ notificationChannels: { telegram: true, email: false } }),
        "contactStuck",
      ),
    ).toBe(true)
  })

  test("filters by the event's notification type", () => {
    const members = [
      member({ id: "a" }),
      member({ id: "b", notificationTypes: { contactStuck: false } }),
      member({ id: "c", telegramChatId: null }),
      member({
        id: "d",
        notificationTypes: {
          notifyAdmin: false,
          newMessageToHuman: true,
          newOrder: false,
        },
      }),
    ]
    expect(
      selectStaffRecipients(members, "contactStuck").map((m) => m.id),
    ).toEqual(["a", "d"])
    expect(
      selectStaffRecipients(members, "notifyAdmin").map((m) => m.id),
    ).toEqual(["a", "b"])
    expect(
      selectStaffRecipients(members, "newMessageToHuman").map((m) => m.id),
    ).toEqual(["a", "b", "d"])
  })
})

describe("debounce and dedupe claims", () => {
  test("one incoming-message notification per conversation per window", async () => {
    const fake = createFakeStore()
    await expect(
      claimIncomingMessageNotification(fake.store, "9"),
    ).resolves.toBe(true)
    await expect(
      claimIncomingMessageNotification(fake.store, "9"),
    ).resolves.toBe(false)
    // Another conversation is independent.
    await expect(
      claimIncomingMessageNotification(fake.store, "10"),
    ).resolves.toBe(true)

    fake.advance(INCOMING_MESSAGE_DEBOUNCE_SECONDS * 1000)
    await expect(
      claimIncomingMessageNotification(fake.store, "9"),
    ).resolves.toBe(true)
    expect(incomingMessageClaimKey("9")).toBe("staff-notifier:incoming:9")
  })

  test("a stuck position is reported once; a new position is new", async () => {
    const fake = createFakeStore()
    const row = {
      contactInboxId: "5",
      flowId: "7",
      nodeId: "node-a",
      reachedAt: new Date("2026-10-01T10:00:00Z"),
    }
    await expect(claimStuckNotification(fake.store, row)).resolves.toBe(true)
    await expect(claimStuckNotification(fake.store, row)).resolves.toBe(false)
    // Same node re-entered later → new timestamp → new claim.
    await expect(
      claimStuckNotification(fake.store, {
        ...row,
        reachedAt: new Date("2026-10-02T10:00:00Z"),
      }),
    ).resolves.toBe(true)
    await expect(
      claimStuckNotification(fake.store, { ...row, nodeId: "node-b" }),
    ).resolves.toBe(true)
    expect(stuckClaimKey(row)).not.toContain(" ")
  })
})

describe("telegram html", () => {
  const ctx: StaffMessageContext = {
    locale: "ru",
    workspaceName: "Shop <&>",
    contactName: 'Ann <b>"x"</b>',
    link: "https://app.example.com/space/1/inbox?conversationId=2&x=<y>",
    step: { flowName: "Sales & <Leads>", stepLabel: "Pay > now" },
  }

  test("escapes the characters Telegram HTML cares about", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    )
  })

  test("never lets contact or flow content inject tags", () => {
    const html = renderIncomingMessage(ctx, "<script>alert(1)</script> & hi")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("<b>Ann &lt;b&gt;&quot;x&quot;&lt;/b&gt;</b>")
    expect(html).toContain("Sales &amp; &lt;Leads&gt; › Pay &gt; now")
    expect(html).toContain(
      '<a href="https://app.example.com/space/1/inbox?conversationId=2&amp;x=&lt;y&gt;">',
    )
    expect(html).toContain("Shop &lt;&amp;&gt;")
    // Only our own tags remain.
    const tags = html.match(ANY_TAG) ?? []
    for (const tag of tags) {
      expect(tag).toMatch(OWN_TAG)
    }
  })

  test("truncates the quoted text to 200 characters", () => {
    const html = renderIncomingMessage(ctx, "я".repeat(500))
    const quoted = QUOTED_PREVIEW.exec(html)
    expect(quoted?.[1]?.length).toBe(199)
  })

  test("truncateText respects code points and whitespace", () => {
    expect(truncateText("  a   b  ", 10)).toBe("a b")
    expect(truncateText("😀😀😀", 2)).toBe("😀…")
  })

  test("step notification shows the rendered text and the contact", () => {
    const html = renderStepReached(
      { ...ctx, locale: "en", step: null },
      "Ann reached <payment>",
    )
    expect(html).toContain("🔔 Ann reached &lt;payment&gt;")
    expect(html).toContain("👤 <b>")
    expect(html).toContain("Open conversation")
  })

  test("stuck message shows step and duration", () => {
    const html = renderContactStuck(ctx, 26 * 3_600_000)
    expect(html).toContain(
      "застрял: Sales &amp; &lt;Leads&gt; › Pay &gt; now, 26 ч",
    )
    expect(formatStuckDuration("en", 3 * 24 * 3_600_000)).toBe("3 d")
    expect(formatStuckDuration("ru", 10 * 60_000)).toBe("1 ч")
  })

  test("summary lists the biggest groups and counts the rest", () => {
    const html = renderContactStuckSummary(
      { locale: "ru", workspaceName: "W", link: "https://x.test/inbox" },
      {
        total: 42,
        thresholdHours: 24,
        groups: Array.from({ length: 7 }, (_, index) => ({
          step: { flowName: `F${index}`, stepLabel: "S" },
          count: 7 - index,
        })),
      },
    )
    expect(html).toContain("42 человека застряли дольше 24 ч")
    expect(html).toContain("• F0 › S — 7")
    expect(html).not.toContain("F5")
    expect(html).toContain("…и ещё 2")
  })

  test("locale and russian plurals", () => {
    expect(resolveStaffMessageLocale("ru")).toBe("ru")
    expect(resolveStaffMessageLocale("ru-RU")).toBe("ru")
    expect(resolveStaffMessageLocale("de")).toBe("en")
    expect(resolveStaffMessageLocale(undefined)).toBe("en")
    const forms = (n: number) => pluralRu(n, "one", "few", "many")
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(forms)).toEqual([
      "one",
      "few",
      "many",
      "many",
      "many",
      "one",
      "few",
      "many",
      "many",
    ])
  })
})

describe("stuck selection logic", () => {
  const now = new Date("2026-10-06T12:00:00Z")

  test("window: older than the threshold, within the look-back", () => {
    const window = computeStuckScanWindow(now, 24)
    expect(window).not.toBeNull()
    if (!window) {
      return
    }
    expect(window.staleBefore.toISOString()).toBe("2026-10-05T12:00:00.000Z")
    expect(window.notBefore.getTime()).toBe(
      window.staleBefore.getTime() - STUCK_SCAN_LOOKBACK_MS,
    )

    const hoursAgo = (hours: number) =>
      new Date(now.getTime() - hours * 3_600_000)
    expect(isInStuckWindow(hoursAgo(23), window)).toBe(false) // not yet stuck
    expect(isInStuckWindow(hoursAgo(24), window)).toBe(true) // exactly at threshold
    expect(isInStuckWindow(hoursAgo(29), window)).toBe(true)
    expect(isInStuckWindow(hoursAgo(30), window)).toBe(false) // beyond look-back
  })

  test("threshold 0 (or junk) turns the scan off", () => {
    expect(computeStuckScanWindow(now, 0)).toBeNull()
    expect(computeStuckScanWindow(now, -3)).toBeNull()
    expect(computeStuckScanWindow(now, Number.NaN)).toBeNull()
  })

  test("clamps the configured hours", () => {
    expect(clampStuckHours(0)).toBe(0)
    expect(clampStuckHours(-1)).toBe(0)
    expect(clampStuckHours(2.6)).toBe(3)
    expect(clampStuckHours(100_000)).toBe(720)
  })

  const row = (id: string, flowId: string, nodeId: string): StuckRow => ({
    contactInboxId: id,
    flowId,
    nodeId,
    reachedAt: new Date(`2026-10-05T0${id}:00:00Z`),
  })

  test("groups by step, biggest first", () => {
    expect(
      groupStuckRows([
        row("1", "f1", "a"),
        row("2", "f2", "b"),
        row("3", "f2", "b"),
        row("4", "f1", "a"),
        row("5", "f2", "b"),
      ]),
    ).toEqual([
      { flowId: "f2", nodeId: "b", count: 3 },
      { flowId: "f1", nodeId: "a", count: 2 },
    ])
  })

  test("few stuck contacts: one event each, deterministic colon-free job ids", () => {
    const planned = planStuckEvents(
      [row("1", "f1", "a"), row("2", "f1", "b")],
      24,
    )
    expect(planned).toHaveLength(2)
    expect(planned[0]?.event).toEqual({
      kind: "contactStuck",
      contactInboxId: "1",
      flowId: "f1",
      nodeId: "a",
      reachedAt: "2026-10-05T01:00:00.000Z",
    })
    for (const { jobId } of planned) {
      expect(jobId).toBeDefined()
      expect(jobId).not.toContain(":")
    }
  })

  test("many stuck contacts: a single summary", () => {
    const rows = ["1", "2", "3", "4", "5", "6"].map((id) =>
      row(id, "f1", id === "6" ? "b" : "a"),
    )
    const planned = planStuckEvents(rows, 48)
    expect(planned).toEqual([
      {
        event: {
          kind: "contactStuckSummary",
          total: 6,
          thresholdHours: 48,
          groups: [
            { flowId: "f1", nodeId: "a", count: 5 },
            { flowId: "f1", nodeId: "b", count: 1 },
          ],
        },
      },
    ])
    expect(planStuckEvents([], 24)).toEqual([])
  })
})

describe("telegram errors and webhook secret", () => {
  test("classifies unreachable chats and rate limits", () => {
    const blocked = new StaffNotifierTelegramError({
      method: "sendMessage",
      errorCode: 403,
      description: "Forbidden: bot was blocked by the user",
    })
    expect(blocked.isChatUnreachable).toBe(true)
    expect(blocked.isRateLimited).toBe(false)

    const notFound = new StaffNotifierTelegramError({
      method: "sendMessage",
      errorCode: 400,
      description: "Bad Request: chat not found",
    })
    expect(notFound.isChatUnreachable).toBe(true)

    const badHtml = new StaffNotifierTelegramError({
      method: "sendMessage",
      errorCode: 400,
      description: "Bad Request: can't parse entities",
    })
    expect(badHtml.isChatUnreachable).toBe(false)

    const limited = new StaffNotifierTelegramError({
      method: "sendMessage",
      errorCode: 429,
      description: "Too Many Requests: retry after 5",
      retryAfterSeconds: 5,
    })
    expect(limited.isRateLimited).toBe(true)
    expect(limited.retryAfterSeconds).toBe(5)
  })

  test("derives a stable, Telegram-safe secret from the token", async () => {
    const a = await deriveStaffNotifierWebhookSecret("123:abc")
    const b = await deriveStaffNotifierWebhookSecret("123:abc")
    const c = await deriveStaffNotifierWebhookSecret("123:abd")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(HEX_SECRET)
    expect(a).not.toContain("123:abc")
  })

  test("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true)
    expect(safeEqual("abc", "abd")).toBe(false)
    expect(safeEqual("abc", "abcd")).toBe(false)
  })
})
