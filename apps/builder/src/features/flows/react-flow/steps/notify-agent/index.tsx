import {
  type NotifyAgentStepSchema,
  notifyAgentStepDefaultFn,
  notifyAgentStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import NotifyAgentStepEditor from "./editor"
import NotifyAgentStepViewer from "./viewer"

export const notifyAgentStep: StepDefinition<NotifyAgentStepSchema> = {
  editor: NotifyAgentStepEditor,
  viewer: NotifyAgentStepViewer,
  validator: notifyAgentStepSchema,
  defaultFn: notifyAgentStepDefaultFn,
}
