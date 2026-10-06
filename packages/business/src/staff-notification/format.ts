/**
 * Telegram texts for staff. Telegram's HTML parse mode only needs `&`, `<`
 * and `>` escaped in text, plus `"` inside attribute values (the link href).
 * Every piece of user/contact-controlled content goes through `escapeHtml`.
 *
 * These strings live outside the builder's next-intl catalogs because they
 * are rendered in the worker; the workspace language picks Russian or
 * English (fallback).
 */

export const INCOMING_TEXT_MAX_CHARS = 200
export const STEP_TEXT_MAX_CHARS = 1000

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Cuts on a code point boundary and marks the cut with an ellipsis. */
export function truncateText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  const chars = Array.from(normalized)
  if (chars.length <= maxChars) {
    return normalized
  }
  return `${chars
    .slice(0, Math.max(0, maxChars - 1))
    .join("")
    .trimEnd()}…`
}

export type StaffMessageLocale = "en" | "ru"

export const resolveStaffMessageLocale = (
  language: string | null | undefined,
): StaffMessageLocale =>
  language?.toLowerCase().startsWith("ru") ? "ru" : "en"

const texts = {
  en: {
    unknownContact: "Contact",
    writes: "writes",
    stepReached: "Flow notification",
    handoff: "is waiting for an operator",
    stuck: "is stuck",
    stuckSummary: (total: number, hours: string) =>
      `${total} contacts are stuck for longer than ${hours}:`,
    currentStep: "Step",
    openConversation: "Open conversation",
    openInbox: "Open inbox",
    hours: (value: number) => `${value} h`,
    days: (value: number) => `${value} d`,
    moreSteps: (count: number) => `…and ${count} more`,
    linked: (workspace: string) =>
      `Done! Notifications from "${workspace}" will arrive here. To stop them, send /stop or use "Disconnect" in the settings.`,
    linkInvalid:
      'This link has expired or was already used. Open the notification settings and press "Connect Telegram" again.',
    startWithoutCode:
      'To receive notifications, open your workspace settings and press "Connect Telegram".',
    stopped:
      "Notifications are turned off. You can connect again in the settings.",
    stopNothing: "This chat is not connected to any workspace.",
  },
  ru: {
    unknownContact: "Клиент",
    writes: "пишет",
    stepReached: "Уведомление из сценария",
    handoff: "ждёт оператора",
    stuck: "застрял",
    stuckSummary: (total: number, hours: string) =>
      `${total} ${pluralRu(total, "человек застрял", "человека застряли", "человек застряли")} дольше ${hours}:`,
    currentStep: "Шаг",
    openConversation: "Открыть диалог",
    openInbox: "Открыть входящие",
    hours: (value: number) => `${value} ч`,
    days: (value: number) => `${value} д`,
    moreSteps: (count: number) => `…и ещё ${count}`,
    linked: (workspace: string) =>
      `Готово, уведомления подключены. Сюда будут приходить уведомления из «${workspace}». Чтобы отключить их, отправьте /stop или нажмите «Отключить» в настройках.`,
    linkInvalid:
      "Ссылка устарела или уже использована. Откройте настройки уведомлений и нажмите «Подключить Telegram» ещё раз.",
    startWithoutCode:
      "Чтобы получать уведомления, откройте настройки рабочего пространства и нажмите «Подключить Telegram».",
    stopped: "Уведомления отключены. Подключить их снова можно в настройках.",
    stopNothing: "Этот чат не подключён ни к одному рабочему пространству.",
  },
} as const

export function pluralRu(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) {
    return one
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few
  }
  return many
}

export const staffBotReplies = (locale: StaffMessageLocale) => texts[locale]

export function formatStuckDuration(
  locale: StaffMessageLocale,
  milliseconds: number,
): string {
  const hours = Math.max(1, Math.floor(milliseconds / 3_600_000))
  if (hours >= 48) {
    return texts[locale].days(Math.floor(hours / 24))
  }
  return texts[locale].hours(hours)
}

export type StaffStepRef = {
  flowName: string
  /** Node name, text preview or type — whatever identifies the step best. */
  stepLabel: string
}

export type StaffMessageContext = {
  locale: StaffMessageLocale
  workspaceName: string
  contactName: string | null
  /** Absolute link into the builder (conversation or inbox). */
  link: string
  step: StaffStepRef | null
}

const STEP_PART_MAX_CHARS = 80

const stepText = (step: StaffStepRef): string =>
  `${escapeHtml(truncateText(step.flowName, STEP_PART_MAX_CHARS))} › ${escapeHtml(truncateText(step.stepLabel, STEP_PART_MAX_CHARS))}`

const contactLabel = (ctx: StaffMessageContext): string =>
  `<b>${escapeHtml(ctx.contactName?.trim() || texts[ctx.locale].unknownContact)}</b>`

const workspaceLabel = (name: string): string =>
  escapeHtml(truncateText(name, STEP_PART_MAX_CHARS))

function footer(
  ctx: Pick<StaffMessageContext, "link" | "workspaceName">,
  linkLabel: string,
): string {
  return `<a href="${escapeHtml(ctx.link)}">${escapeHtml(linkLabel)}</a> · ${workspaceLabel(ctx.workspaceName)}`
}

function stepLine(ctx: StaffMessageContext): string | null {
  return ctx.step
    ? `📍 ${escapeHtml(texts[ctx.locale].currentStep)}: ${stepText(ctx.step)}`
    : null
}

/**
 * Every variable part is truncated before escaping (contact text 200, step
 * text 1000, flow/step names 80, workspace name 80, at most 5 summary
 * groups), so a message stays far below Telegram's 4096-char limit without
 * ever slicing through an HTML tag.
 */
const join = (lines: (string | null)[]): string =>
  lines.filter((line) => line !== null).join("\n")

export function renderIncomingMessage(
  ctx: StaffMessageContext,
  text: string,
): string {
  const t = texts[ctx.locale]
  const preview = truncateText(text, INCOMING_TEXT_MAX_CHARS)
  return join([
    `💬 ${contactLabel(ctx)} ${escapeHtml(t.writes)}:`,
    preview ? `«${escapeHtml(preview)}»` : null,
    stepLine(ctx),
    footer(ctx, t.openConversation),
  ])
}

export function renderStepReached(
  ctx: StaffMessageContext,
  text: string,
): string {
  const t = texts[ctx.locale]
  const body = truncateText(text, STEP_TEXT_MAX_CHARS)
  return join([
    `🔔 ${body ? escapeHtml(body) : escapeHtml(t.stepReached)}`,
    `👤 ${contactLabel(ctx)}`,
    stepLine(ctx),
    footer(ctx, t.openConversation),
  ])
}

export function renderHandoff(ctx: StaffMessageContext): string {
  const t = texts[ctx.locale]
  return join([
    `🙋 ${contactLabel(ctx)} ${escapeHtml(t.handoff)}`,
    stepLine(ctx),
    footer(ctx, t.openConversation),
  ])
}

export function renderContactStuck(
  ctx: StaffMessageContext,
  stuckForMs: number,
): string {
  const t = texts[ctx.locale]
  const where = ctx.step ? `: ${stepText(ctx.step)}` : ""
  return join([
    `⏳ ${contactLabel(ctx)} ${escapeHtml(t.stuck)}${where}, ${escapeHtml(formatStuckDuration(ctx.locale, stuckForMs))}`,
    footer(ctx, t.openConversation),
  ])
}

export const STUCK_SUMMARY_MAX_GROUPS = 5

export function renderContactStuckSummary(
  ctx: Omit<StaffMessageContext, "contactName" | "step">,
  props: {
    total: number
    thresholdHours: number
    groups: { step: StaffStepRef | null; count: number }[]
  },
): string {
  const t = texts[ctx.locale]
  const shown = props.groups.slice(0, STUCK_SUMMARY_MAX_GROUPS)
  const hidden = props.groups.length - shown.length
  const thresholdLabel = formatStuckDuration(
    ctx.locale,
    props.thresholdHours * 3_600_000,
  )
  return join([
    `⏳ ${escapeHtml(t.stuckSummary(props.total, thresholdLabel))}`,
    ...shown.map(
      (group) =>
        `• ${group.step ? stepText(group.step) : "—"} — ${group.count}`,
    ),
    hidden > 0 ? escapeHtml(t.moreSteps(hidden)) : null,
    footer(ctx, t.openInbox),
  ])
}
