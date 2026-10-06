import type { useTranslations } from "next-intl"
import type { CurrentFlowStepResource } from "../schemas/resource"

type TranslationFn = ReturnType<typeof useTranslations>

// Same labels the flow editor uses for its node types (`nodes/*/index.ts`).
const NODE_TYPE_LABEL_KEYS: Record<string, string> = {
  sendMessage: "actions.sendMessage",
  startFlow: "flows.actions.startFlow",
  performAction: "flows.actions.performAction",
  condition: "flows.actions.condition",
  sendMail: "actions.sendMail",
  splitTraffic: "flows.actions.splitTraffic",
  wait: "actions.wait",
  followUp: "actions.followUp",
  landingPage: "actions.landingPage",
}

/**
 * Human label of a step: the node name given in the builder, else the node
 * type, plus the first words of its text when the name alone is generic.
 */
export function formatStepLabel(
  step: Pick<CurrentFlowStepResource, "nodeType" | "nodeName" | "nodePreview">,
  t: TranslationFn,
): string {
  if (step.nodeType === null) {
    return t("currentStep.removedStep")
  }
  const typeKey = NODE_TYPE_LABEL_KEYS[step.nodeType]
  const name = step.nodeName ?? (typeKey ? t(typeKey) : t("currentStep.step"))
  return step.nodePreview ? `${name} — ${step.nodePreview}` : name
}
