# Telegram `video_note` (round video message) support

This document traces how the Telegram integration already handles incoming
attachments, and how `video_note` was added to follow the exact same path —
per project rule: a new attachment type must reuse the existing pipeline, not
invent its own, so upstream updates to `integrations/telegram` don't silently
break it.

## Baseline: how `video` (and `audio`/`document`) already flow end to end

1. **Schema** (`integrations/telegram/src/schema.ts`)
   `telegramMessageSchema` has one optional field per Telegram attachment kind
   (`document`, `audio`, `video`, `voice`, ...), each typed as
   `telegramFileSchema` — `{ file_id, file_unique_id, file_size?, file_name?,
   mime_type? }`.

2. **Incoming handler** (`integrations/telegram/src/handlers/message/incoming-message.ts`)
   `getMessageAttachments()` checks each optional field on the parsed
   `TelegramMessage` in turn (`if (message.video) { ... }`) and, when present,
   calls `downloadAndUploadFile(ctx, fileId, mimeType)` with the field's
   `mime_type` (falling back to a sane default, e.g. `"video/mp4"` for video).

3. **Download from Bot API** (`downloadAndUploadFile`, same file)
   - `getTelegramFileUrl(ctx.auth, fileId)` (`apis/bot.ts`) calls
     `getFile` on the Bot API to resolve `file_id` → `file_path`, then builds
     `https://api.telegram.org/file/bot<token>/<file_path>`. This call is
     wrapped in `rescue()`, and a `404` (expired/oversized file) is swallowed
     — `getTelegramFileUrl` returns `undefined` rather than throwing.
   - The URL is `fetch()`-ed; a non-OK response or missing body also aborts
     quietly (`return null`).

4. **Storage write** (same function)
   The raw bytes are buffered and written to platform storage via
   `ctx.uploader.putObject(originPath, buffer, { ACL: "public-read",
   ContentType: mimeType })`, at `${ctx.storagePrefix}/${createId()}`.

5. **Attachment becomes visible to the flow**
   `downloadAndUploadFile` returns an `IncomingAttachment`:
   `{ sourceId, originPath, fileType, mimeType, size }`, where `fileType` is
   derived generically from the mime type by
   `guessFileTypeFromMimeType()` (`packages/sdk/src/lib/util.ts`): the
   `<type>/<subtype>` prefix (`video`, `audio`, `image`) maps 1:1, anything
   else becomes `"file"`. This attachment is pushed onto
   `IncomingMessage.attachments`, which is the generic contract every
   downstream consumer (wait-for-reply matching, questionnaire engine,
   `ai-speech-to-text` step) reads — none of them special-case Telegram or a
   specific attachment subtype; they only look at `fileType`/`mimeType` on
   the stored attachment.

So the contract a new attachment type must satisfy is entirely upstream of
the flow engine: parse it in the schema, download+store it exactly like an
existing type, and pick a correct mime type so `guessFileTypeFromMimeType`
classifies it correctly. Nothing else needs to change.

## `video_note` specifics

Telegram's `video_note` object (Bot API) differs from `video`:

| | `video` | `video_note` |
|---|---|---|
| `file_name` | present (optional) | **never present** |
| `mime_type` | present (optional) | **never present** |
| dimensions | `width` × `height` | `length` (diameter of the square/circle) |
| `duration` | present | present |
| always mp4? | no (depends on client) | **yes, always** |

Because `mime_type` is never sent, the handler cannot fall back to
`message.video_note.mime_type ?? "video/mp4"` the way `video` does — it hard
codes `"video/mp4"` unconditionally. That is correct per the Bot API spec
(video notes are always encoded as mp4) and is enough for
`guessFileTypeFromMimeType` to classify the stored attachment as `fileType:
"video"`, identically to a regular video attachment — which is what lets it
reach the wait-for-reply step and `ai-speech-to-text` through the exact same
generic contract, no branching added downstream.

## Changes made

- `integrations/telegram/src/schema.ts` — added `telegramVideoNoteSchema`
  (`file_id`, `file_unique_id`, `length`, `duration`, `file_size?` — no
  `file_name`/`mime_type`) and wired `video_note` onto `telegramMessageSchema`.
- `integrations/telegram/src/handlers/message/incoming-message.ts` — added a
  `message.video_note` branch in `getMessageAttachments()`, calling the same
  `downloadAndUploadFile()` used by every other attachment type, with the
  mime type hard coded to `"video/mp4"`.
- `integrations/telegram/__tests__/video-note.test.ts` — new tests: receiving
  a message with `video_note` downloads+stores the file and produces a
  `video` attachment with no `file_name`; a `getFile` 404 (oversized/expired)
  is swallowed like it is for `video`; the resulting `IncomingMessage`
  reaches `receiveMessage()`'s output the same way a `video` message does, so
  a wait-for-reply step downstream sees an identical shape.

## Telegram Bot API limits considered (task 4.8)

- **Download size cap**: the public Bot API only serves `getFile`/file
  download for files ≤ 20 MB; `video_note` clips are capped by Telegram
  clients themselves (well under that), so this is a non-issue in practice.
  The existing `404`-swallow path already handles the case gracefully (drops
  the attachment instead of throwing) — behavior is unchanged, inherited
  as-is, not duplicated.
- **`file_path` TTL**: Telegram guarantees the `file_path` returned by
  `getFile` is valid for **at least 1 hour**. `getTelegramFileUrl` is called
  synchronously right after the webhook fires and the resulting URL is
  `fetch()`-ed immediately in the same request, so this window is a non-issue
  for the normal flow. No caching of `file_path` happens anywhere in the
  integration, so there's nothing that could go stale.
- **Re-sending the same file**: Telegram may reuse `file_id` if the same
  physical file is forwarded/re-sent, but each `getFile` call still needs a
  fresh `file_path` lookup — the integration always re-resolves it per
  message rather than caching by `file_id`, so no stale-URL bug is possible.
  This is identical to how `video`/`audio`/`document` already behave; nothing
  `video_note`-specific was needed here.
