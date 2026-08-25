import { describe, expect, it } from "vitest"

import { isSupportedAudioContentType } from "../src/integration/handlers/speech-to-text"

// Telegram video_note (кружки) and regular video replies are stored with a
// video/* content-type, but they carry an audio track that must still reach
// OpenAI's transcription endpoint. This guards the regression where such
// replies were silently rejected with "Unsupported audio format: video/mp4"
// before ever reaching the AI SDK's transcribe() call.
describe("isSupportedAudioContentType", () => {
  it("accepts video/mp4 (Telegram video_note / video replies)", () => {
    expect(isSupportedAudioContentType("video/mp4")).toBe(true)
  })

  it("accepts video/mp4 with a charset parameter", () => {
    expect(isSupportedAudioContentType("video/mp4; charset=binary")).toBe(true)
  })

  it("accepts video/webm", () => {
    expect(isSupportedAudioContentType("video/webm")).toBe(true)
  })

  it("still accepts the pre-existing audio/* whitelist", () => {
    for (const mime of [
      "audio/mpeg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/wav",
      "audio/webm",
      "audio/ogg",
      "audio/x-wav",
      "audio/mp3",
    ]) {
      expect(isSupportedAudioContentType(mime)).toBe(true)
    }
  })

  it("rejects video/quicktime (.mov) — not a documented OpenAI transcription format", () => {
    expect(isSupportedAudioContentType("video/quicktime")).toBe(false)
  })

  it("rejects unrelated content types", () => {
    expect(isSupportedAudioContentType("image/jpeg")).toBe(false)
    expect(isSupportedAudioContentType("application/octet-stream")).toBe(false)
  })

  it("rejects empty/missing content-type", () => {
    expect(isSupportedAudioContentType("")).toBe(false)
    expect(isSupportedAudioContentType(null)).toBe(false)
    expect(isSupportedAudioContentType(undefined)).toBe(false)
  })
})
