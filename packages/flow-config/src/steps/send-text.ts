import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

/**
 * Character limit on the *visible* text, not the stored markup — see
 * `getVisibleTextLength` / `docs/rich-text-design.md`.
 */
export const SEND_TEXT_MAX = 1000

export const sendTextStepVersions = z.enum(["v1", "v2"])
export type SendTextStepVersionSchema = z.infer<typeof sendTextStepVersions>

/**
 * Kept a plain `ZodObject` (no `.superRefine` here) on purpose: this is the
 * member used inside `z.discriminatedUnion("stepType", […])` in
 * `nodes/send-message.ts`, and zod's discriminated union needs to read each
 * member's shape statically — an effects-wrapped schema can't be a member.
 * The rich-text/length refinement lives in `channel-rules/send-text-validator.ts`
 * instead, applied on top of this base for both `omnichannel` and `tiktok`.
 */
export const sendTextStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendText),
  // Absent = legacy plain text ("v1") — see docs/rich-text-design.md.
  version: sendTextStepVersions.optional(),
  text: z.string().trim().min(1),
  buttons: z.array(buttonStepSchema),
})

export type SendTextStepSchema = z.infer<typeof sendTextStepSchema>

/**
 * `version` defaults to `"v2"` only when the caller supplies no `text` of
 * its own — that's the shape of the one call site that creates a genuinely
 * blank step for a human to type into (the builder's "add step" menu,
 * `allSteps[stepType].defaultFn(menuItem.props)` with no props). Every other
 * caller (`apps/worker`'s rich-response mirroring of a foreign platform's
 * message, `packages/business`'s appointment-confirmation text, tests
 * constructing fixtures) supplies `text` up front — that text was never
 * authored through the rich editor, so it stays legacy plain text ("v1")
 * unless the caller explicitly opts into `version: "v2"` itself. Getting
 * this backwards would mean AI/external plain text — which can contain a
 * bare "<" or "&" — gets run through the rich-text parser downstream.
 */
export const sendTextStepDefaultFn = (
  props: Partial<SendTextStepSchema> = {},
): SendTextStepSchema => ({
  text: "",
  buttons: [],
  version: props.text === undefined ? sendTextStepVersions.enum.v2 : undefined,
  ...props,
  id: createId(),
  stepType: stepTypes.enum.sendText,
})
