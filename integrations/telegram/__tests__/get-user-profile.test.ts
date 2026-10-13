import type { Context } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test, vi } from "vitest"
import { getUserProfile, pickAvatarSize } from "../src/apis/user"
import { redactTelegramToken } from "../src/lib/http-client"
import type { TelegramAuthValue } from "../src/schema"

const BOT_TOKEN = "123456:fake-test-token"
const API = `https://api.telegram.org/bot${BOT_TOKEN}`
const FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`
const AVATAR_PATH_RE = /^public\/ws\/ws-1\/avatars\/.+/

const buildCtx = () => {
  const putObject = vi.fn().mockResolvedValue(undefined)
  const ctx = {
    auth: { secretText: BOT_TOKEN },
    storagePrefix: "public/ws/ws-1",
    uploader: { putObject },
  } as unknown as Context<TelegramAuthValue>
  return { ctx, putObject }
}

const getChat = (result: Record<string, unknown>) =>
  http.get(`${API}/getChat`, () =>
    HttpResponse.json({
      ok: true,
      result: { id: 100, type: "private", ...result },
    }),
  )

const getFile = (filePath: string) =>
  http.get(`${API}/getFile`, () =>
    HttpResponse.json({
      ok: true,
      result: { file_id: "f", file_unique_id: "u", file_path: filePath },
    }),
  )

const fileBytes = (filePath: string) =>
  http.get(
    `${FILE_API}/${filePath}`,
    () => new HttpResponse(new Uint8Array([1, 2, 3]), { status: 200 }),
  )

describe("telegram getUserProfile", () => {
  test("mirrors the photo to storage even without a username and stores bio", async () => {
    const { ctx, putObject } = buildCtx()
    server.use(
      getChat({
        first_name: "Ada",
        bio: "  Math enthusiast  ",
        photo: { small_file_id: "small-1", big_file_id: "big-1" },
      }),
      getFile("profile_photos/file_1.jpg"),
      fileBytes("profile_photos/file_1.jpg"),
    )

    const contact = await getUserProfile({ ctx, psid: "100" })

    expect(contact.firstName).toBe("Ada")
    expect(contact.bio).toBe("Math enthusiast")
    expect(contact.avatar).toMatch(AVATAR_PATH_RE)
    expect(contact.avatar).not.toContain(BOT_TOKEN)
    expect(putObject).toHaveBeenCalledWith(contact.avatar, expect.any(Buffer), {
      ACL: "public-read",
      ContentType: "image/jpeg",
    })
  })

  test("falls back to getUserProfilePhotos when getChat has no photo", async () => {
    const { ctx } = buildCtx()
    let requestedFileId: string | null = null
    server.use(
      getChat({ first_name: "Ada" }),
      http.get(`${API}/getUserProfilePhotos`, () =>
        HttpResponse.json({
          ok: true,
          result: {
            total_count: 1,
            photos: [
              [
                {
                  file_id: "s160",
                  file_unique_id: "a",
                  width: 160,
                  height: 160,
                },
                {
                  file_id: "s640",
                  file_unique_id: "b",
                  width: 640,
                  height: 640,
                },
              ],
            ],
          },
        }),
      ),
      http.get(`${API}/getFile`, ({ request }) => {
        requestedFileId = new URL(request.url).searchParams.get("file_id")
        return HttpResponse.json({
          ok: true,
          result: {
            file_id: "s160",
            file_unique_id: "a",
            file_path: "p/2.jpg",
          },
        })
      }),
      fileBytes("p/2.jpg"),
    )

    const contact = await getUserProfile({ ctx, psid: "100" })

    expect(requestedFileId).toBe("s160")
    expect(contact.avatar).toMatch(AVATAR_PATH_RE)
  })

  test("privacy-restricted user (no photos) yields no avatar and no upload", async () => {
    const { ctx, putObject } = buildCtx()
    server.use(
      getChat({ first_name: "Ada", username: "ada" }),
      http.get(`${API}/getUserProfilePhotos`, () =>
        HttpResponse.json({ ok: true, result: { total_count: 0, photos: [] } }),
      ),
    )

    const contact = await getUserProfile({ ctx, psid: "100" })

    expect(contact.avatar).toBeUndefined()
    expect(contact.bio).toBeUndefined()
    expect(putObject).not.toHaveBeenCalled()
  })

  test("a failed photo download keeps the profile without an avatar", async () => {
    const { ctx, putObject } = buildCtx()
    server.use(
      getChat({
        first_name: "Ada",
        photo: { small_file_id: "small-1", big_file_id: "big-1" },
      }),
      getFile("profile_photos/file_3.jpg"),
      http.get(
        `${FILE_API}/profile_photos/file_3.jpg`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    )

    const contact = await getUserProfile({ ctx, psid: "100" })

    expect(contact.firstName).toBe("Ada")
    expect(contact.avatar).toBeUndefined()
    expect(putObject).not.toHaveBeenCalled()
  })
})

describe("pickAvatarSize", () => {
  test("picks the smallest size that is at least 160px", () => {
    expect(
      pickAvatarSize([
        { file_id: "640", file_unique_id: "c", width: 640, height: 640 },
        { file_id: "160", file_unique_id: "a", width: 160, height: 160 },
        { file_id: "320", file_unique_id: "b", width: 320, height: 320 },
      ])?.file_id,
    ).toBe("160")
  })

  test("falls back to the largest when all are smaller", () => {
    expect(
      pickAvatarSize([
        { file_id: "80", file_unique_id: "a", width: 80, height: 80 },
        { file_id: "120", file_unique_id: "b", width: 120, height: 120 },
      ])?.file_id,
    ).toBe("120")
  })
})

describe("redactTelegramToken", () => {
  test("removes the bot token from API and file URLs", () => {
    const redacted = redactTelegramToken(
      `GET ${API}/getChat?chat_id=1 and ${FILE_API}/photos/x.jpg`,
    )
    expect(redacted).not.toContain(BOT_TOKEN)
    expect(redacted).toContain("/bot<redacted>/getChat")
    expect(redacted).toContain("/file/bot<redacted>/photos/x.jpg")
  })
})
