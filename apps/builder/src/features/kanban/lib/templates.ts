import type { KanbanStage } from "@chatbotx.io/database/partials"
import { createStageId } from "./columns"

export const kanbanTemplateIds = ["recruiting", "marketing", "simple"] as const
export type KanbanTemplateId = (typeof kanbanTemplateIds)[number]

type TemplateStage = Pick<KanbanStage, "color" | "outcome" | "matchBlocked"> & {
  /** Translation key under `kanban.templates.<template>.stages`. */
  key: string
}

/**
 * Funnel presets. Stage names come from translations, so a board created in
 * Russian stores Russian values — the same values the flow writes with "Set
 * custom field".
 */
const TEMPLATE_STAGES: Record<KanbanTemplateId, TemplateStage[]> = {
  recruiting: [
    { key: "entered", color: "#64748b" },
    { key: "intro", color: "#3b82f6" },
    { key: "questionnaire", color: "#6366f1" },
    { key: "videoInterview", color: "#8b5cf6" },
    { key: "testTask", color: "#f59e0b" },
    { key: "readyForInterview", color: "#14b8a6" },
    { key: "offer", color: "#22c55e", outcome: "won" },
    { key: "rejected", color: "#ef4444", outcome: "lost" },
  ],
  marketing: [
    { key: "new", color: "#64748b" },
    { key: "leadMagnet", color: "#3b82f6" },
    { key: "chainReady", color: "#6366f1" },
    { key: "watching", color: "#f59e0b" },
    { key: "consultation", color: "#22c55e", outcome: "won" },
    { key: "blocked", color: "#ef4444", outcome: "lost", matchBlocked: true },
  ],
  simple: [
    { key: "new", color: "#3b82f6" },
    { key: "inProgress", color: "#f59e0b" },
    { key: "done", color: "#22c55e", outcome: "won" },
  ],
}

export function buildTemplateStages(
  template: KanbanTemplateId,
  translate: (key: string) => string,
): KanbanStage[] {
  return TEMPLATE_STAGES[template].map(({ key, ...stage }) => ({
    id: createStageId(),
    name: translate(`kanban.templates.${template}.stages.${key}`),
    color: stage.color ?? null,
    outcome: stage.outcome ?? null,
    matchBlocked: stage.matchBlocked ?? null,
  }))
}
