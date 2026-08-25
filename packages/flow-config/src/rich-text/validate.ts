import type { z } from "zod"
import { SEND_TEXT_MAX, sendTextStepVersions } from "../steps/send-text"
import { isValidRichText } from "./parser"
import { getVisibleTextLength } from "./renderers"

type SendTextLike = {
  text: string
  version?: z.infer<typeof sendTextStepVersions>
}

/**
 * Shared `superRefine` body for `sendText`: validates `v2` markup parses
 * cleanly, then enforces `SEND_TEXT_MAX` against the *visible* text length
 * (see `getVisibleTextLength`) rather than the raw stored string. Kept out
 * of `sendTextStepSchema` itself because that schema is also a member of
 * `z.discriminatedUnion("stepType", […])` in `nodes/send-message.ts`, which
 * requires a plain object schema — this refinement is layered on in
 * `send-text-validator.ts` instead, the same place tiktok's own refinement
 * is layered on.
 */
export const refineSendTextRichText = (
  step: SendTextLike,
  ctx: z.RefinementCtx,
): void => {
  if (
    step.version === sendTextStepVersions.enum.v2 &&
    !isValidRichText(step.text)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid rich text markup",
      path: ["text"],
    })
    return
  }

  if (getVisibleTextLength(step.text, step.version) > SEND_TEXT_MAX) {
    ctx.addIssue({
      code: "custom",
      message: `Text must be at most ${SEND_TEXT_MAX} characters`,
      path: ["text"],
    })
  }
}
