import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import type { AISpeechToTextSchema } from "@chatbotx.io/flow-config"
import { experimental_transcribe as transcribe } from "ai"
import ky from "ky"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import {
  readCustomFieldValue,
  saveResultToCustomField,
} from "../../utils/contact"
import type { ExecuteStepProps } from "../flow"
import type { ExecuteStepResult } from "../step"

// Telegram video notes (video_note / "circles") and regular video replies are
// uploaded to storage with a video/* content-type (see
// integrations/telegram/src/handlers/message/incoming-message.ts), even though
// they carry an ordinary audio track we want transcribed. That's fine on the
// OpenAI side: the audio/transcriptions endpoint accepts "mp4" and "webm" as
// container formats regardless of whether the caller labels them audio/* or
// video/* (https://developers.openai.com/api/docs/guides/speech-to-text,
// "Supported input formats are mp3, mp4, mpeg, mpga, m4a, wav, and webm"),
// and the `ai` SDK's transcribe() re-detects the media type from the raw
// container bytes before sending it on (audioMediaTypeSignatures in
// node_modules/ai — MP4 "ftyp" / WebM EBML signatures map to audio/mp4 and
// audio/webm either way). So we only need to let these two video containers
// past our own whitelist here; video/quicktime (.mov) is deliberately NOT
// included — OpenAI's docs do not list mov/quicktime as a supported format.
const supportedAudioMimeTypes = z.enum([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/x-wav",
  "audio/mp3",
  "video/mp4",
  "video/webm",
])

export function isSupportedAudioContentType(
  contentType: string | null | undefined,
): boolean {
  const normalized = contentType?.split(";")[0]?.trim() ?? ""
  return (
    normalized.length > 0 &&
    (supportedAudioMimeTypes.options as string[]).includes(normalized)
  )
}

export async function handleAISpeechToText({
  conversation,
  step,
}: ExecuteStepProps<AISpeechToTextSchema>): Promise<ExecuteStepResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return {
        status: "error",
        errorMessage: "AI integration not found",
        result: null,
      }
    }

    const openaiProvider = getAIModel(aiConfig, "openai")

    // Resolve Audio URL
    const audioUrl = await readCustomFieldValue({
      customFieldId: step.inputFieldId,
      contactId: conversation.contactId,
    })

    if (!audioUrl) {
      return {
        status: "error",
        errorMessage: "No audio URL provided",
        result: null,
      }
    }

    if (!("transcription" in openaiProvider)) {
      throw new Error(
        `Provider ${step.provider} does not support transcription`,
      )
    }

    const audioResponse = await ky.get(audioUrl, {
      signal: controller.signal,
      throwHttpErrors: false,
    })
    const rawContentType = audioResponse.headers.get("content-type") ?? ""

    if (!isSupportedAudioContentType(rawContentType)) {
      return {
        status: "error",
        errorMessage: `Unsupported audio format: ${rawContentType || "unknown"}`,
        result: null,
      }
    }

    const audioBuffer = await audioResponse.arrayBuffer()

    const transcript = await transcribe({
      model: openaiProvider.transcription(step.model),
      audio: new Uint8Array(audioBuffer),
      abortSignal: controller.signal,
    })

    if (step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText: transcript.text,
        workspaceId: conversation.workspaceId,
      })
    }

    return { status: "success", result: null }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(error, "[ai-speech-to-text] Step failed")
    return { status: "error", errorMessage: error.message, result: null }
  } finally {
    clearTimeout(timeoutId)
  }
}
