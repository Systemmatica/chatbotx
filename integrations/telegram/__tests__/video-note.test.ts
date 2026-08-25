import type { Context } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"
import type { TelegramAuthValue } from "../src/schema"

const BOT_TOKEN = "telegram-token"
const STORAGE_PREFIX_RE = /^workspace-1\//

const baseMessage = {
  message_id: 10,
  from: {
    id: 100,
    is_bot: false,
    first_name: "Ada",
  },
  chat: {
    id: 100,
    type: "private" as const,
  },
  date: 1_765_440_000,
}

const buildCtx = (): Context<TelegramAuthValue> => {
  const putObject = vi.fn().mockResolvedValue(undefined)
  return {
    auth: { secretText: BOT_TOKEN },
    storagePrefix: "workspace-1",
    uploader: { putObject },
  } as unknown as Context<TelegramAuthValue>
}

describe("telegram video_note attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("downloads and stores a video note the same way as a regular video", async () => {
    const ctx = buildCtx()

    server.use(
      http.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`, () =>
        HttpResponse.json({
          ok: true,
          result: {
            file_id: "vn-file-1",
            file_unique_id: "vn-unique-1",
            file_size: 12_345,
            file_path: "video_notes/file_1.mp4",
          },
        }),
      ),
      http.get(
        `https://api.telegram.org/file/bot${BOT_TOKEN}/video_notes/file_1.mp4`,
        () => new HttpResponse(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
      ),
    )

    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          message: {
            ...baseMessage,
            video_note: {
              file_id: "vn-file-1",
              file_unique_id: "vn-unique-1",
              length: 384,
              duration: 12,
              file_size: 12_345,
            },
          },
        },
      },
    })

    expect(result.message.attachments).toHaveLength(1)
    const [attachment] = result.message.attachments
    expect(attachment).toMatchObject({
      fileType: "video",
      mimeType: "video/mp4",
      size: 4,
    })
    // video_note never carries a file_name — this must not throw or leak
    // an undefined-but-required field into the stored attachment.
    expect(attachment).not.toHaveProperty("file_name")

    const uploader = ctx.uploader as unknown as {
      putObject: ReturnType<typeof vi.fn>
    }
    expect(uploader.putObject).toHaveBeenCalledTimes(1)
    const [originPath, , options] = uploader.putObject.mock.calls[0]
    expect(originPath).toMatch(STORAGE_PREFIX_RE)
    expect(options).toMatchObject({
      ACL: "public-read",
      ContentType: "video/mp4",
    })
  })

  test("drops the attachment (without throwing) when getFile 404s, same as video", async () => {
    const ctx = buildCtx()

    server.use(
      http.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`, () =>
        HttpResponse.json(
          { ok: false, error_code: 404, description: "file not found" },
          { status: 404 },
        ),
      ),
    )

    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          message: {
            ...baseMessage,
            video_note: {
              file_id: "vn-file-expired",
              file_unique_id: "vn-unique-expired",
              length: 384,
              duration: 12,
            },
          },
        },
      },
    })

    expect(result.message.attachments).toHaveLength(0)
    const uploader = ctx.uploader as unknown as {
      putObject: ReturnType<typeof vi.fn>
    }
    expect(uploader.putObject).not.toHaveBeenCalled()
  })

  test("reaches the generic wait-for-reply shape identically to a video message", async () => {
    const ctx = buildCtx()

    server.use(
      http.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`, () =>
        HttpResponse.json({
          ok: true,
          result: {
            file_id: "vn-file-2",
            file_unique_id: "vn-unique-2",
            file_path: "video_notes/file_2.mp4",
          },
        }),
      ),
      http.get(
        `https://api.telegram.org/file/bot${BOT_TOKEN}/video_notes/file_2.mp4`,
        () => new HttpResponse(new Uint8Array([9]), { status: 200 }),
      ),
    )

    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          message: {
            ...baseMessage,
            video_note: {
              file_id: "vn-file-2",
              file_unique_id: "vn-unique-2",
              length: 384,
              duration: 5,
            },
          },
        },
      },
    })

    // The wait-for-reply / questionnaire engine only ever inspects
    // IncomingMessage.attachments[].fileType — it doesn't know about
    // Telegram-specific message shapes. A video_note answer must present
    // itself exactly like a video answer would.
    expect(result.message.messageType).toBe("incoming")
    expect(result.message.attachments[0]?.fileType).toBe("video")
    expect(result.contact.sourceId).toBe("100")
  })
})
