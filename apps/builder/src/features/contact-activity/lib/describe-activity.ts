import type { useTranslations } from "next-intl"
import { formatStepLabel } from "@/features/flow-steps/lib/step-label"
import type { ContactActivityItemResource } from "../schemas"

type TranslationFn = ReturnType<typeof useTranslations>

// Channel brand names are proper nouns, not translated copy.
const CHANNEL_NAMES: Record<string, string> = {
  omnichannel: "Omnichannel",
  webchat: "Webchat",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  zalo: "Zalo",
  smtp: "Email",
  telegram: "Telegram",
  instagram: "Instagram",
  tiktok: "TikTok",
  api: "API",
}

const channelName = (channel: string | null | undefined): string | null =>
  channel ? (CHANNEL_NAMES[channel] ?? channel) : null

const sourceLabel = (
  source: string | null | undefined,
  t: TranslationFn,
): string | null => {
  if (!source) {
    return null
  }
  const key = `condition.sources.${source}`
  return t.has(key) ? t(key) : source
}

const joinParts = (parts: (string | null | undefined)[]): string | null => {
  const present = parts.filter((part): part is string => Boolean(part))
  return present.length > 0 ? present.join(" · ") : null
}

export type ActivityDescription = {
  title: string
  detail: string | null
}

/** Title and secondary line of one feed entry. */
export function describeActivity(
  item: ContactActivityItemResource,
  t: TranslationFn,
): ActivityDescription {
  const d = item.details
  const deletedTag = t("contactActivity.deletedTag")

  switch (item.type) {
    case "contactCreated":
      return {
        title: t("contactActivity.events.contactCreated"),
        detail: joinParts([
          d.inboxName ?? channelName(d.channel),
          sourceLabel(d.source, t),
        ]),
      }
    case "channelConnected":
      return {
        title: t("contactActivity.events.channelConnected", {
          channel: channelName(d.channel) ?? "—",
        }),
        detail: joinParts([d.inboxName, sourceLabel(d.source, t)]),
      }
    case "tagAdded":
      return {
        title: t("contactActivity.events.tagAdded", {
          tag: d.tagName ?? deletedTag,
        }),
        detail: null,
      }
    case "tagRemoved":
      return {
        title: t("contactActivity.events.tagRemoved", {
          tag: d.tagName ?? deletedTag,
        }),
        detail: null,
      }
    case "leadMagnetReceived":
      return {
        title: t("contactActivity.events.leadMagnetReceived", {
          name: d.leadMagnetName ?? d.tagName ?? deletedTag,
        }),
        detail: null,
      }
    case "customFieldChanged":
      return {
        title: t("contactActivity.events.customFieldChanged", {
          field: d.customFieldName ?? "—",
        }),
        detail: `${d.oldValue ?? t("contactActivity.emptyValue")} → ${d.newValue ?? t("contactActivity.emptyValue")}`,
      }
    case "flowStarted":
      return {
        title: t("contactActivity.events.flowStarted", {
          flow: d.flowName ?? t("contactActivity.deletedFlow"),
        }),
        detail: null,
      }
    case "stepReached":
      return {
        title: t("contactActivity.events.stepReached", {
          step: formatStepLabel(
            {
              nodeType: d.nodeType ?? null,
              nodeName: d.nodeName ?? null,
              nodePreview: d.nodePreview ?? null,
            },
            t,
          ),
        }),
        detail: d.flowName ?? null,
      }
    case "noteAdded":
      return {
        title: t("contactActivity.events.noteAdded"),
        detail: d.notePreview ?? null,
      }
    case "assignmentChanged": {
      if (!d.assigneeKind) {
        return {
          title: t("contactActivity.events.unassigned"),
          detail: null,
        }
      }
      return {
        title: t("contactActivity.events.assigned", {
          name: d.assigneeName ?? "—",
        }),
        detail:
          d.assigneeKind === "team" ? t("contactActivity.assigneeTeam") : null,
      }
    }
    case "conversationClosed":
      return {
        title: t("contactActivity.events.conversationClosed"),
        detail: null,
      }
    default:
      return { title: item.type, detail: null }
  }
}

/** "Bot", "API", the member's name — or nothing for system facts. */
export function describeActor(
  actor: ContactActivityItemResource["actor"],
  t: TranslationFn,
): string | null {
  if (!actor) {
    return null
  }
  if (actor.type === "bot") {
    return t("contactActivity.actors.bot")
  }
  if (actor.type === "api") {
    return t("contactActivity.actors.api")
  }
  return actor.name ?? t("contactActivity.actors.teamMember")
}
