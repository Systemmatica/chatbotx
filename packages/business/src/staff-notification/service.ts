import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNotNull,
  sql,
} from "@chatbotx.io/database/client"
import {
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { parseEnvBool } from "@chatbotx.io/utils"
import {
  DefaultJobAction,
  defaultQueue,
  type StaffNotificationEvent,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import {
  type CurrentFlowStep,
  currentFlowStepService,
} from "../flow/current-step"
import { integrationContextEnv } from "../integration-context/keys"
import { logger } from "../logger"
import { deriveUrls } from "../platform/derive-urls"
import { resolveWorkspaceAppUrl } from "../platform/settings"
import { workspaceService } from "../workspace/service"
import { workspaceMemberCacheTag } from "../workspace-member/service"
import {
  claimIncomingMessageNotification,
  claimStuckNotification,
  stuckClaimKey,
} from "./claims"
import {
  deriveStaffNotifierWebhookSecret,
  getStaffNotifierBotToken,
  getStaffNotifierBotUsernameFromEnv,
  isStaffNotifierConfigured,
  STAFF_NOTIFIER_WEBHOOK_PATH,
  safeEqual,
} from "./config"
import {
  renderContactStuck,
  renderContactStuckSummary,
  renderHandoff,
  renderIncomingMessage,
  renderStepReached,
  resolveStaffMessageLocale,
  type StaffMessageContext,
  type StaffStepRef,
  staffBotReplies,
} from "./format"
import {
  consumeStaffLinkCode,
  issueStaffLinkCode,
  parseStartCommand,
} from "./link-code"
import {
  resolveStaffNotificationTypes,
  type StaffNotificationType,
  type StaffNotificationTypes,
  selectStaffRecipients,
} from "./preferences"
import { redisStaffNotifierStore, type StaffNotifierStore } from "./store"
import {
  clampStuckHours,
  computeStuckScanWindow,
  planStuckEvents,
  STUCK_IGNORED_NODE_TYPES,
  type StuckRow,
  type StuckScanWindow,
} from "./stuck"
import { callTelegramBotApi, StaffNotifierTelegramError } from "./telegram-api"

/** Rows fetched per page / at most per workspace per scan. */
const STUCK_PAGE_SIZE = 500
const STUCK_MAX_ROWS_PER_WORKSPACE = 2000
/** Wait inline for a 429 only when Telegram asks for a short pause. */
const MAX_INLINE_RETRY_AFTER_SECONDS = 30

const deliveryJobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5000 },
  // Keep the id for an hour so a retried `notifyStaff` job cannot re-add a
  // delivery that already went out.
  removeOnComplete: { age: 3600, count: 5000 },
  removeOnFail: { age: 24 * 3600, count: 5000 },
}

export type StaffNotificationSettings = {
  /** The platform notifier bot is configured (env). */
  available: boolean
  connected: boolean
  types: StaffNotificationTypes
  stuckContactNotifyHours: number
}

export type TelegramWebhookReply = {
  method: "sendMessage"
  chat_id: number | string
  text: string
}

type TelegramUpdate = {
  message?: {
    text?: string
    chat?: { id?: number | string; type?: string }
    from?: { language_code?: string }
  }
}

type ContactContext = {
  conversationId: string | null
  contactName: string | null
  step: StaffStepRef | null
  current: {
    currentFlowId: string | null
    currentNodeId: string | null
    currentNodeAt: Date | null
  } | null
}

const eventNotificationType = (
  event: StaffNotificationEvent,
): StaffNotificationType => {
  switch (event.kind) {
    case "incomingMessage":
      return "newMessageToHuman"
    case "stepReached":
    case "handoff":
      return "notifyAdmin"
    case "contactStuck":
    case "contactStuckSummary":
      return "contactStuck"
    default:
      return "notifyAdmin"
  }
}

export const toStaffStepRef = (
  step: CurrentFlowStep | null | undefined,
): StaffStepRef | null =>
  step
    ? {
        flowName: step.flowName,
        stepLabel:
          step.nodeName ?? step.nodePreview ?? step.nodeType ?? step.nodeId,
      }
    : null

const TRAILING_SLASHES = /\/+$/
const JOB_ID_UNSAFE = /[^\w-]/g
const STOP_COMMAND = /^\/stop(?:@\w+)?$/

const withoutTrailingSlash = (url: string): string =>
  url.replace(TRAILING_SLASHES, "")

/** BullMQ custom ids must not contain ":". */
const safeJobIdPart = (value: string): string =>
  value.replace(JOB_ID_UNSAFE, "_")

class StaffNotificationService extends BaseService {
  private botUsernamePromise: Promise<string> | null = null
  private readonly store: StaffNotifierStore

  constructor(store: StaffNotifierStore) {
    super()
    this.store = store
  }

  isConfigured(): boolean {
    return isStaffNotifierConfigured()
  }

  // ─── Settings (builder, current member) ──────────────────────────────────

  async getSettings(props: {
    workspaceId: string
    userId: string
  }): Promise<StaffNotificationSettings> {
    const [member, workspace] = await Promise.all([
      this.findMember(props),
      workspaceService.findById({ id: props.workspaceId }),
    ])
    return {
      available: this.isConfigured(),
      connected: Boolean(
        member?.telegramChatId &&
          member.notificationChannels?.telegram !== false,
      ),
      types: resolveStaffNotificationTypes(member?.notificationTypes),
      stuckContactNotifyHours: workspace.stuckContactNotifyHours,
    }
  }

  /** One-time deep link that binds the member's Telegram chat on `/start`. */
  async createLinkUrl(props: {
    workspaceId: string
    userId: string
  }): Promise<{ url: string; expiresAt: Date }> {
    this.assertConfigured()
    const member = await this.findMember(props)
    if (!member) {
      throw new Error("Workspace member not found")
    }
    const [{ code, expiresAt }, username] = await Promise.all([
      issueStaffLinkCode(this.store, {
        workspaceMemberId: member.id,
        workspaceId: props.workspaceId,
        userId: props.userId,
      }),
      this.getBotUsername(),
    ])
    return {
      url: `https://t.me/${encodeURIComponent(username)}?start=${code}`,
      expiresAt,
    }
  }

  async disconnect(props: { workspaceId: string; userId: string }) {
    await db
      .update(workspaceMemberModel)
      .set({
        telegramChatId: null,
        notificationChannels: sql`COALESCE(${workspaceMemberModel.notificationChannels}, '{}'::jsonb) || '{"telegram": false}'::jsonb`,
      })
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, props.workspaceId),
          eq(workspaceMemberModel.userId, props.userId),
        ),
      )
    await this.invalidateMemberCaches([props])
  }

  async updateTypes(props: {
    workspaceId: string
    userId: string
    types: Partial<StaffNotificationTypes>
  }): Promise<StaffNotificationTypes> {
    const patch: Partial<StaffNotificationTypes> = {}
    for (const [key, value] of Object.entries(props.types)) {
      if (
        typeof value === "boolean" &&
        (key === "newMessageToHuman" ||
          key === "notifyAdmin" ||
          key === "contactStuck")
      ) {
        patch[key] = value
      }
    }
    const [row] = await db
      .update(workspaceMemberModel)
      .set({
        // Merge so keys this screen does not own (e.g. `newOrder`) survive.
        notificationTypes: sql`COALESCE(${workspaceMemberModel.notificationTypes}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
      })
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, props.workspaceId),
          eq(workspaceMemberModel.userId, props.userId),
        ),
      )
      .returning({ notificationTypes: workspaceMemberModel.notificationTypes })
    await this.invalidateMemberCaches([props])
    return resolveStaffNotificationTypes(row?.notificationTypes)
  }

  async updateStuckThreshold(props: {
    workspaceId: string
    hours: number
  }): Promise<number> {
    const hours = clampStuckHours(props.hours)
    await workspaceService.update({
      id: props.workspaceId,
      data: { stuckContactNotifyHours: hours },
    })
    return hours
  }

  // ─── Telegram webhook (builder public route) ─────────────────────────────

  async isValidWebhookSecret(header: string | null): Promise<boolean> {
    const token = getStaffNotifierBotToken()
    if (!(token && header)) {
      return false
    }
    const expected = await deriveStaffNotifierWebhookSecret(token)
    return safeEqual(header, expected)
  }

  /**
   * Handles a bot update. Returns the reply as a webhook-response method call
   * (Telegram executes it), so linking needs no outbound API request.
   */
  async handleTelegramUpdate(
    update: unknown,
  ): Promise<TelegramWebhookReply | null> {
    const message = (update as TelegramUpdate | null)?.message
    const chatId = message?.chat?.id
    if (
      message?.chat?.type !== "private" ||
      (typeof chatId !== "number" && typeof chatId !== "string")
    ) {
      return null
    }
    const t = staffBotReplies(
      resolveStaffMessageLocale(message.from?.language_code),
    )
    const reply = (text: string): TelegramWebhookReply => ({
      method: "sendMessage",
      chat_id: chatId,
      text,
    })
    const text = message.text?.trim() ?? ""

    if (STOP_COMMAND.test(text)) {
      const unlinked = await this.unlinkChat(String(chatId))
      return reply(unlinked > 0 ? t.stopped : t.stopNothing)
    }

    const start = parseStartCommand(text)
    if (!start.isStart) {
      return null
    }
    if (!start.code) {
      return reply(t.startWithoutCode)
    }
    const payload = await consumeStaffLinkCode(this.store, start.code)
    if (!payload) {
      return reply(t.linkInvalid)
    }
    const workspaceName = await this.linkMember({
      ...payload,
      chatId: String(chatId),
    })
    return reply(
      workspaceName === null ? t.linkInvalid : t.linked(workspaceName),
    )
  }

  /**
   * Points the bot's webhook at this builder. Idempotent (Telegram just
   * overwrites it), so it is safe to run on every builder boot.
   */
  async registerWebhook(): Promise<{ url: string } | null> {
    const token = getStaffNotifierBotToken()
    if (!token) {
      return null
    }
    const env = integrationContextEnv()
    const { appUrl } = deriveUrls(env.NEXT_PUBLIC_BUILDER_URL, undefined, {
      forceHttps: parseEnvBool(env.FORCE_PUBLIC_HTTPS),
    })
    const url = `${withoutTrailingSlash(appUrl)}${STAFF_NOTIFIER_WEBHOOK_PATH}`
    if (!url.startsWith("https://")) {
      logger.warn(
        { url },
        "[staff-notifier] Telegram requires an HTTPS webhook; skipping registration",
      )
      return null
    }
    await callTelegramBotApi<boolean>(token, "setWebhook", {
      url,
      secret_token: await deriveStaffNotifierWebhookSecret(token),
      allowed_updates: ["message"],
    })
    return { url }
  }

  /** Boot hook for the builder: logs the outcome, never throws. */
  async registerWebhookOnBoot(): Promise<void> {
    if (!this.isConfigured()) {
      return
    }
    try {
      const registered = await this.registerWebhook()
      if (registered) {
        logger.info(
          { url: registered.url },
          "[staff-notifier] Telegram webhook registered",
        )
      }
    } catch (error) {
      logger.error(
        { err: error },
        "[staff-notifier] Telegram webhook registration failed",
      )
    }
  }

  async getBotUsername(): Promise<string> {
    const fromEnv = getStaffNotifierBotUsernameFromEnv()
    if (fromEnv) {
      return fromEnv
    }
    const token = this.assertConfigured()
    if (!this.botUsernamePromise) {
      this.botUsernamePromise = callTelegramBotApi<{ username?: string }>(
        token,
        "getMe",
      ).then((me) => {
        if (!me.username) {
          throw new Error("Telegram getMe returned no username")
        }
        return me.username
      })
      // A failed lookup must not stick: the next call retries.
      this.botUsernamePromise.catch(() => {
        this.botUsernamePromise = null
      })
    }
    return await this.botUsernamePromise
  }

  // ─── Producers (worker hot paths: cheap, never throw) ────────────────────

  /**
   * A contact wrote and no bot will answer. Debounced per conversation so a
   * burst of messages produces one notification.
   */
  async notifyIncomingMessage(props: {
    workspaceId: string
    conversationId: string
    contactInboxId: string
    text: string
  }): Promise<void> {
    if (!this.isConfigured()) {
      return
    }
    await this.safely("notifyIncomingMessage", props, async () => {
      const claimed = await claimIncomingMessageNotification(
        this.store,
        props.conversationId,
      )
      if (!claimed) {
        return
      }
      await this.enqueueEvent(props.workspaceId, {
        kind: "incomingMessage",
        conversationId: props.conversationId,
        contactInboxId: props.contactInboxId,
        text: props.text,
      })
    })
  }

  async notifyStepReached(props: {
    workspaceId: string
    conversationId: string
    contactInboxId: string
    text: string
  }): Promise<void> {
    if (!this.isConfigured()) {
      return
    }
    await this.safely("notifyStepReached", props, async () => {
      await this.enqueueEvent(props.workspaceId, {
        kind: "stepReached",
        conversationId: props.conversationId,
        contactInboxId: props.contactInboxId,
        text: props.text,
      })
    })
  }

  async notifyHandoff(props: {
    workspaceId: string
    conversationId: string
  }): Promise<void> {
    if (!this.isConfigured()) {
      return
    }
    await this.safely("notifyHandoff", props, async () => {
      await this.enqueueEvent(props.workspaceId, {
        kind: "handoff",
        conversationId: props.conversationId,
      })
    })
  }

  async enqueueEvent(
    workspaceId: string,
    event: StaffNotificationEvent,
    jobId?: string,
  ): Promise<void> {
    await defaultQueue.add(
      DefaultJobAction.notifyStaff,
      { type: DefaultJobAction.notifyStaff, data: { workspaceId, event } },
      jobId
        ? {
            jobId,
            removeOnComplete: { age: 24 * 3600, count: 5000 },
          }
        : undefined,
    )
  }

  // ─── Consumers (worker jobs) ─────────────────────────────────────────────

  /**
   * `notifyStaff` job: picks recipients, renders one text, fans out one
   * delivery job per recipient so a 429/403 on one chat never re-sends to
   * the others.
   */
  async processEvent(props: {
    workspaceId: string
    event: StaffNotificationEvent
    jobId: string
  }): Promise<{ recipients: number }> {
    if (!this.isConfigured()) {
      return { recipients: 0 }
    }
    const { workspaceId, event } = props
    const recipients = selectStaffRecipients(
      await this.listLinkedMembers(workspaceId),
      eventNotificationType(event),
    )
    if (recipients.length === 0) {
      return { recipients: 0 }
    }

    const html = await this.renderEvent(workspaceId, event)
    if (!html) {
      return { recipients: 0 }
    }

    await defaultQueue.addBulk(
      recipients.map((member) => ({
        name: DefaultJobAction.deliverStaffNotification,
        data: {
          type: DefaultJobAction.deliverStaffNotification,
          data: { workspaceId, workspaceMemberId: member.id, html },
        },
        opts: {
          ...deliveryJobOptions,
          jobId: `staff-deliver-${safeJobIdPart(props.jobId)}-${member.id}`,
        },
      })),
    )
    return { recipients: recipients.length }
  }

  /** `deliverStaffNotification` job: one Telegram message to one member. */
  async deliver(props: {
    workspaceId: string
    workspaceMemberId: string
    html: string
  }): Promise<"sent" | "skipped" | "unlinked"> {
    const token = getStaffNotifierBotToken()
    if (!token) {
      return "skipped"
    }
    const [member] = await db
      .select({
        telegramChatId: workspaceMemberModel.telegramChatId,
        notificationChannels: workspaceMemberModel.notificationChannels,
        userId: workspaceMemberModel.userId,
      })
      .from(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.id, props.workspaceMemberId),
          eq(workspaceMemberModel.workspaceId, props.workspaceId),
        ),
      )
      .limit(1)
    // Re-checked at send time: the member may have disconnected since.
    if (
      !member?.telegramChatId ||
      member.notificationChannels?.telegram === false
    ) {
      return "skipped"
    }

    const chatId = member.telegramChatId
    const send = () =>
      callTelegramBotApi(token, "sendMessage", {
        chat_id: chatId,
        text: props.html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      })

    try {
      try {
        await send()
      } catch (error) {
        const retryAfter =
          error instanceof StaffNotifierTelegramError && error.isRateLimited
            ? error.retryAfterSeconds
            : null
        if (
          retryAfter === null ||
          retryAfter > MAX_INLINE_RETRY_AFTER_SECONDS
        ) {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
        await send()
      }
      return "sent"
    } catch (error) {
      if (
        error instanceof StaffNotifierTelegramError &&
        error.isChatUnreachable
      ) {
        await this.unlinkMemberChat({
          workspaceMemberId: props.workspaceMemberId,
          workspaceId: props.workspaceId,
          userId: member.userId,
          chatId,
        })
        logger.info(
          {
            workspaceId: props.workspaceId,
            workspaceMemberId: props.workspaceMemberId,
          },
          "[staff-notifier] chat unreachable (blocked bot?); Telegram unlinked",
        )
        return "unlinked"
      }
      // Rate limits and transient failures: let BullMQ retry with backoff.
      throw error
    }
  }

  /**
   * Cron: reports contacts that sit on one flow step past their workspace's
   * threshold. Only workspaces with at least one linked member are scanned,
   * each through its own inboxes (index-backed), and each stale position is
   * claimed once in Redis so repeated scans stay silent.
   */
  async scanStuckContacts(now: Date = new Date()): Promise<{
    workspaces: number
    notified: number
  }> {
    if (!this.isConfigured()) {
      return { workspaces: 0, notified: 0 }
    }
    const workspaces = await this.listWorkspacesForStuckScan()
    let notified = 0
    for (const workspace of workspaces) {
      const window = computeStuckScanWindow(now, workspace.hours)
      if (!window) {
        continue
      }
      try {
        notified += await this.scanWorkspaceStuckContacts({
          workspaceId: workspace.id,
          thresholdHours: workspace.hours,
          window,
        })
      } catch (error) {
        logger.error(
          { err: error, workspaceId: workspace.id },
          "[staff-notifier] stuck scan failed for workspace; continuing",
        )
      }
    }
    return { workspaces: workspaces.length, notified }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private assertConfigured(): string {
    const token = getStaffNotifierBotToken()
    if (!token) {
      throw new Error("Telegram staff notifications are not configured")
    }
    return token
  }

  private async safely(
    operation: string,
    context: Record<string, unknown>,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn()
    } catch (error) {
      logger.error(
        {
          err: error,
          workspaceId: context.workspaceId,
          conversationId: context.conversationId,
        },
        `[staff-notifier] ${operation} failed; ignoring`,
      )
    }
  }

  private async findMember(props: {
    workspaceId: string
    userId: string
    tx?: DatabaseClient
  }) {
    const { tx = db } = props
    const [member] = await tx
      .select({
        id: workspaceMemberModel.id,
        telegramChatId: workspaceMemberModel.telegramChatId,
        notificationChannels: workspaceMemberModel.notificationChannels,
        notificationTypes: workspaceMemberModel.notificationTypes,
      })
      .from(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, props.workspaceId),
          eq(workspaceMemberModel.userId, props.userId),
        ),
      )
      .limit(1)
    return member
  }

  private async listLinkedMembers(workspaceId: string) {
    return await db
      .select({
        id: workspaceMemberModel.id,
        telegramChatId: workspaceMemberModel.telegramChatId,
        notificationChannels: workspaceMemberModel.notificationChannels,
        notificationTypes: workspaceMemberModel.notificationTypes,
      })
      .from(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, workspaceId),
          isNotNull(workspaceMemberModel.telegramChatId),
        ),
      )
  }

  /** Returns the workspace name, or null when the membership is gone. */
  private async linkMember(props: {
    workspaceMemberId: string
    workspaceId: string
    userId: string
    chatId: string
  }): Promise<string | null> {
    const [row] = await db
      .update(workspaceMemberModel)
      .set({
        telegramChatId: props.chatId,
        notificationChannels: sql`COALESCE(${workspaceMemberModel.notificationChannels}, '{}'::jsonb) || '{"telegram": true}'::jsonb`,
      })
      .where(
        and(
          eq(workspaceMemberModel.id, props.workspaceMemberId),
          eq(workspaceMemberModel.workspaceId, props.workspaceId),
          eq(workspaceMemberModel.userId, props.userId),
        ),
      )
      .returning({ id: workspaceMemberModel.id })
    if (!row) {
      return null
    }
    await this.invalidateMemberCaches([props])
    const workspace = await workspaceService.findById({ id: props.workspaceId })
    return workspace.name
  }

  /** `/stop` from Telegram: unlink this chat everywhere. */
  private async unlinkChat(chatId: string): Promise<number> {
    const rows = await db
      .update(workspaceMemberModel)
      .set({
        telegramChatId: null,
        notificationChannels: sql`COALESCE(${workspaceMemberModel.notificationChannels}, '{}'::jsonb) || '{"telegram": false}'::jsonb`,
      })
      .where(eq(workspaceMemberModel.telegramChatId, chatId))
      .returning({
        workspaceId: workspaceMemberModel.workspaceId,
        userId: workspaceMemberModel.userId,
      })
    await this.invalidateMemberCaches(rows)
    return rows.length
  }

  /** Unlinks only if the member still points at the chat that failed. */
  private async unlinkMemberChat(props: {
    workspaceMemberId: string
    workspaceId: string
    userId: string
    chatId: string
  }): Promise<void> {
    await db
      .update(workspaceMemberModel)
      .set({
        telegramChatId: null,
        notificationChannels: sql`COALESCE(${workspaceMemberModel.notificationChannels}, '{}'::jsonb) || '{"telegram": false}'::jsonb`,
      })
      .where(
        and(
          eq(workspaceMemberModel.id, props.workspaceMemberId),
          eq(workspaceMemberModel.workspaceId, props.workspaceId),
          eq(workspaceMemberModel.telegramChatId, props.chatId),
        ),
      )
    await this.invalidateMemberCaches([props])
  }

  private async invalidateMemberCaches(
    members: readonly { workspaceId: string; userId: string }[],
  ): Promise<void> {
    if (members.length === 0) {
      return
    }
    const tags = new Set<string>()
    for (const member of members) {
      tags.add(workspaceMemberCacheTag(member.userId))
      tags.add(`workspaces:${member.workspaceId}:workspace-members`)
    }
    await this.invalidateCacheTags([...tags]).catch((err) => {
      logger.warn({ err }, "[staff-notifier] member cache invalidation failed")
    })
  }

  private async messageBase(workspaceId: string) {
    const [workspace, appUrl] = await Promise.all([
      workspaceService.findById({ id: workspaceId }),
      resolveWorkspaceAppUrl({ workspaceId }),
    ])
    return {
      locale: resolveStaffMessageLocale(workspace.language),
      workspaceName: workspace.name,
      inboxUrl: `${withoutTrailingSlash(appUrl)}/space/${workspaceId}/inbox`,
    }
  }

  private async renderEvent(
    workspaceId: string,
    event: StaffNotificationEvent,
  ): Promise<string | null> {
    const base = await this.messageBase(workspaceId)

    if (event.kind === "contactStuckSummary") {
      const steps = await currentFlowStepService.resolveMany({
        workspaceId,
        refs: event.groups.map((group) => ({
          currentFlowId: group.flowId,
          currentNodeId: group.nodeId,
          currentNodeAt: new Date(),
        })),
      })
      return renderContactStuckSummary(
        {
          locale: base.locale,
          workspaceName: base.workspaceName,
          link: base.inboxUrl,
        },
        {
          total: event.total,
          thresholdHours: event.thresholdHours,
          groups: event.groups.map((group, index) => ({
            step: toStaffStepRef(steps[index]),
            count: group.count,
          })),
        },
      )
    }

    const contact = await this.loadContactContext(workspaceId, event)
    if (!contact) {
      return null
    }
    const ctx: StaffMessageContext = {
      locale: base.locale,
      workspaceName: base.workspaceName,
      contactName: contact.contactName,
      step: contact.step,
      link: contact.conversationId
        ? `${base.inboxUrl}?conversationId=${contact.conversationId}`
        : base.inboxUrl,
    }

    switch (event.kind) {
      case "incomingMessage":
        return renderIncomingMessage(ctx, event.text)
      case "stepReached":
        return renderStepReached(ctx, event.text)
      case "handoff":
        return renderHandoff(ctx)
      case "contactStuck": {
        const reachedAt = new Date(event.reachedAt)
        // Moved on (or re-entered the node) between the scan and this job.
        if (
          contact.current?.currentFlowId !== event.flowId ||
          contact.current?.currentNodeId !== event.nodeId ||
          contact.current?.currentNodeAt?.getTime() !== reachedAt.getTime()
        ) {
          return null
        }
        return renderContactStuck(ctx, Date.now() - reachedAt.getTime())
      }
      default:
        return null
    }
  }

  /**
   * Contact name, conversation and current step for an event, all scoped to
   * the workspace (an id from another workspace resolves to nothing).
   */
  private async loadContactContext(
    workspaceId: string,
    event: Exclude<StaffNotificationEvent, { kind: "contactStuckSummary" }>,
  ): Promise<ContactContext | null> {
    let conversationId: string | null = null
    let contactId: string | null = null
    let contactName: string | null = null

    if ("conversationId" in event) {
      const conversation = await db.query.conversationModel.findFirst({
        where: { id: event.conversationId, workspaceId },
        columns: { id: true, contactId: true },
        with: { contact: { columns: { fullName: true } } },
      })
      if (!conversation) {
        return null
      }
      conversationId = conversation.id
      contactId = conversation.contactId
      contactName = conversation.contact?.fullName ?? null
    }

    const contactInboxId =
      "contactInboxId" in event ? event.contactInboxId : null
    const contactInbox = contactInboxId
      ? await db.query.contactInboxModel.findFirst({
          where: {
            id: contactInboxId,
            contact: { workspaceId },
            ...(contactId ? { contactId } : {}),
          },
          columns: {
            contactId: true,
            currentFlowId: true,
            currentNodeId: true,
            currentNodeAt: true,
          },
          with: { contact: { columns: { fullName: true } } },
        })
      : null

    if (contactInboxId && !contactInbox) {
      return null
    }

    if (!conversationId && contactInbox) {
      const conversation = await db.query.conversationModel.findFirst({
        where: { contactId: contactInbox.contactId, workspaceId },
        columns: { id: true },
        orderBy: { createdAt: "desc" },
      })
      conversationId = conversation?.id ?? null
      contactName = contactInbox.contact?.fullName ?? null
    }

    const current: ContactContext["current"] = contactInbox
      ? {
          currentFlowId: contactInbox.currentFlowId,
          currentNodeId: contactInbox.currentNodeId,
          currentNodeAt: contactInbox.currentNodeAt
            ? new Date(contactInbox.currentNodeAt)
            : null,
        }
      : null

    // Handoff carries no contact inbox: use the contact's latest position.
    let step: StaffStepRef | null = null
    if (current) {
      step = toStaffStepRef(
        await currentFlowStepService.resolveOne({ workspaceId, ref: current }),
      )
    } else if (contactId) {
      const resolved = await currentFlowStepService.resolveForContact({
        workspaceId,
        contactId,
      })
      step = toStaffStepRef(resolved)
    }

    return { conversationId, contactName, step, current }
  }

  private async listWorkspacesForStuckScan(): Promise<
    { id: string; hours: number }[]
  > {
    const rows = await db
      .selectDistinct({
        id: workspaceModel.id,
        hours: workspaceModel.stuckContactNotifyHours,
      })
      .from(workspaceModel)
      .innerJoin(
        workspaceMemberModel,
        eq(workspaceMemberModel.workspaceId, workspaceModel.id),
      )
      .where(
        and(
          isNotNull(workspaceMemberModel.telegramChatId),
          sql`${workspaceModel.stuckContactNotifyHours} > 0`,
          sql`${workspaceModel.scheduledDeletionAt} IS NULL`,
        ),
      )
    return rows
  }

  private async scanWorkspaceStuckContacts(props: {
    workspaceId: string
    thresholdHours: number
    window: StuckScanWindow
  }): Promise<number> {
    const claimed: StuckRow[] = []
    let cursor: { reachedAt: Date; contactInboxId: string } | null = null
    let fetched = 0

    while (fetched < STUCK_MAX_ROWS_PER_WORKSPACE) {
      const page = await this.findStuckPage({
        workspaceId: props.workspaceId,
        window: props.window,
        cursor,
      })
      fetched += page.length
      for (const row of page) {
        if (await claimStuckNotification(this.store, row)) {
          claimed.push(row)
        }
      }
      const last = page.at(-1)
      if (page.length < STUCK_PAGE_SIZE || !last) {
        break
      }
      cursor = {
        reachedAt: last.reachedAt,
        contactInboxId: last.contactInboxId,
      }
    }

    if (claimed.length === 0) {
      return 0
    }

    try {
      for (const planned of planStuckEvents(claimed, props.thresholdHours)) {
        await this.enqueueEvent(props.workspaceId, planned.event, planned.jobId)
      }
    } catch (error) {
      // Give the rows back so the next scan can report them.
      await Promise.all(
        claimed.map((row) =>
          this.store.delete(stuckClaimKey(row)).catch(() => undefined),
        ),
      )
      throw error
    }
    return claimed.length
  }

  /**
   * One keyset page of stale positions in a workspace. A position counts
   * only when the flow still exists, the node has an outgoing edge (a node
   * with none is where the flow ends — the contact finished, not stuck), the
   * node is not a timed wait, and no human has taken the conversation over.
   */
  private async findStuckPage(props: {
    workspaceId: string
    window: StuckScanWindow
    cursor: { reachedAt: Date; contactInboxId: string } | null
  }): Promise<StuckRow[]> {
    const { workspaceId, window, cursor } = props
    const ignoredTypes = sql.join(
      STUCK_IGNORED_NODE_TYPES.map((type) => sql`${type}`),
      sql`, `,
    )
    const result = await db.execute<{
      contactInboxId: string | number
      flowId: string | number
      nodeId: string
      reachedAt: Date | string
    }>(sql`
      SELECT
        ci."id" AS "contactInboxId",
        ci."currentFlowId" AS "flowId",
        ci."currentNodeId" AS "nodeId",
        ci."currentNodeAt" AS "reachedAt"
      FROM "Inbox" i
      JOIN "ContactInbox" ci ON ci."inboxId" = i."id"
      JOIN "Contact" c
        ON c."id" = ci."contactId" AND c."workspaceId" = i."workspaceId"
      JOIN "Flow" f
        ON f."id" = ci."currentFlowId" AND f."workspaceId" = i."workspaceId"
      JOIN "FlowVersion" v
        ON v."id" = COALESCE(f."currentVersionId", f."draftVersionId")
        AND v."workspaceId" = f."workspaceId"
      WHERE i."workspaceId" = ${workspaceId}
        AND ci."currentNodeId" IS NOT NULL
        AND ci."currentNodeAt" <= ${window.staleBefore}::timestamptz
        AND ci."currentNodeAt" > ${window.notBefore}::timestamptz
        ${
          cursor
            ? sql`AND (ci."currentNodeAt", ci."id") > (${cursor.reachedAt}::timestamptz, ${cursor.contactInboxId}::int8)`
            : sql``
        }
        AND EXISTS (
          SELECT 1 FROM unnest(v."edges") AS e
          WHERE e->>'source' = ci."currentNodeId"
        )
        AND NOT EXISTS (
          SELECT 1 FROM unnest(v."nodes") AS n
          WHERE n->>'id' = ci."currentNodeId"
            AND n->>'type' IN (${ignoredTypes})
        )
        AND NOT EXISTS (
          SELECT 1 FROM "Conversation" conv
          WHERE conv."contactId" = ci."contactId"
            AND conv."workspaceId" = i."workspaceId"
            AND conv."botEnabled" = false
        )
      ORDER BY ci."currentNodeAt" ASC, ci."id" ASC
      LIMIT ${STUCK_PAGE_SIZE}
    `)
    return result.rows.map((row) => ({
      contactInboxId: String(row.contactInboxId),
      flowId: String(row.flowId),
      nodeId: row.nodeId,
      reachedAt: new Date(row.reachedAt),
    }))
  }
}

export const staffNotificationService = new StaffNotificationService(
  redisStaffNotifierStore,
)
