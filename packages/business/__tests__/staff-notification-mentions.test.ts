import { describe, expect, test } from "vitest"
import { renderNoteMention } from "../src/staff-notification/format"
import {
  type MentionRecipientCandidate,
  selectMentionRecipients,
} from "../src/staff-notification/preferences"

const member = (
  overrides: Partial<MentionRecipientCandidate> & { userId: string },
): MentionRecipientCandidate => ({
  id: `m-${overrides.userId}`,
  telegramChatId: "100",
  notificationChannels: null,
  ...overrides,
})

describe("selectMentionRecipients", () => {
  test("notifies only mentioned members with Telegram linked", () => {
    const result = selectMentionRecipients(
      [
        member({ userId: "1" }),
        member({ userId: "2" }),
        member({ userId: "3", telegramChatId: null }),
      ],
      { mentionedUserIds: ["1", "3"], authorUserId: "9" },
    )
    expect(result.recipients.map((m) => m.userId)).toEqual(["1"])
    expect(result.unreachable.map((m) => m.userId)).toEqual(["3"])
  })

  test("never notifies the author, even when they mention themselves", () => {
    const result = selectMentionRecipients(
      [member({ userId: "1" }), member({ userId: "2" })],
      { mentionedUserIds: ["1", "2"], authorUserId: "1" },
    )
    expect(result.recipients.map((m) => m.userId)).toEqual(["2"])
    expect(result.unreachable).toEqual([])
  })

  test("treats Telegram switched off as unreachable", () => {
    const result = selectMentionRecipients(
      [member({ userId: "1", notificationChannels: { telegram: false } })],
      { mentionedUserIds: ["1"], authorUserId: "9" },
    )
    expect(result.recipients).toEqual([])
    expect(result.unreachable.map((m) => m.userId)).toEqual(["1"])
  })

  test("ignores notification type switches (a mention is personal)", () => {
    const result = selectMentionRecipients(
      [
        {
          ...member({ userId: "1" }),
          notificationTypes: { notifyAdmin: false, newMessageToHuman: false },
        } as MentionRecipientCandidate,
      ],
      { mentionedUserIds: ["1"], authorUserId: "9" },
    )
    expect(result.recipients).toHaveLength(1)
  })

  test("deduplicates a member listed twice", () => {
    const result = selectMentionRecipients(
      [member({ userId: "1" }), member({ userId: "1", id: "other" })],
      { mentionedUserIds: ["1"], authorUserId: "9" },
    )
    expect(result.recipients).toHaveLength(1)
  })
})

describe("renderNoteMention", () => {
  const ctx = {
    locale: "ru" as const,
    workspaceName: "Acme <ws>",
    contactName: "Иван <b>",
    link: "https://app.example.test/space/1/inbox?conversationId=5",
  }

  test("renders author, contact, text and link with HTML escaped", () => {
    const html = renderNoteMention(ctx, {
      authorName: "Анна & Co",
      noteText: "@Борис глянь <скрипт>",
    })
    expect(html).toContain("<b>Анна &amp; Co</b> упомянул(а) вас в заметке о")
    expect(html).toContain("<b>Иван &lt;b&gt;</b>:")
    expect(html).toContain("«@Борис глянь &lt;скрипт&gt;»")
    expect(html).toContain(
      '<a href="https://app.example.test/space/1/inbox?conversationId=5">Открыть диалог</a>',
    )
    expect(html).toContain("Acme &lt;ws&gt;")
  })

  test("falls back to generic names in English", () => {
    const html = renderNoteMention(
      { ...ctx, locale: "en", contactName: null },
      { authorName: null, noteText: "hi" },
    )
    expect(html).toContain(
      "<b>A team member</b> mentioned you in a note about <b>Contact</b>:",
    )
  })

  test("truncates a long note", () => {
    const html = renderNoteMention(ctx, {
      authorName: "A",
      noteText: "я".repeat(2000),
    })
    expect(html.length).toBeLessThan(1000)
    expect(html).toContain("…»")
  })
})
