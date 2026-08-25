# Rich text in `sendText` steps

## Problem

The flow editor promises formatted messages (bold, italic, links) but never
delivers them: `TiptapEditor` calls `editor.getText({ blockSeparator: "\n" })`
in `apps/builder/src/components/tiptap/tiptap-editor.tsx` and
`plain-text-tiptap-editor.tsx`, which drops every mark. `sendText.text` in
`packages/flow-config/src/steps/send-text.ts` is a plain `z.string()` and
can't carry markup even if the editor kept it. None of the eight channel
handlers that read `step.text` (`api`, `instagram-facebook`, `instagram`,
`messenger`, `telegram`, `tiktok`, `whatsapp`, `zalo`) apply a `parse_mode`
or channel-specific markdown.

## Decision: HTML subset in the same `text` field, gated by a `version` tag

Three options were on the table:

1. **HTML subset in `text`, discriminated by a `version` field.**
2. A second field (`richText`/`textHtml`) alongside plain `text`.
3. Store tiptap's JSON document.

**Chosen: option 1**, mirroring the precedent already in this codebase —
`packages/flow-config/src/steps/spreadsheet.ts` /
`migrations/spreadsheet-write-mapping.ts` version a step's `map` field the
same way (`spreadsheetStepVersions`, `v1`/`v2`, no `version` = legacy).
`sendTextStepSchema` gets the same treatment:

```ts
export const sendTextStepVersions = z.enum(["v1", "v2"])
export const sendTextStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.sendText),
  version: sendTextStepVersions.optional(),
  text: z.string().trim().min(1),
  buttons: z.array(buttonStepSchema),
}).superRefine(refineSendTextLength)
```

- **No `version` (legacy flows)** → `text` is treated exactly as before:
  an opaque plain string, sent byte-for-byte to every channel, no
  `parse_mode`, no escaping, no length reinterpretation. This is what makes
  old chains work with **zero data migration** — no batch job has to touch
  existing rows, the absence of the field *is* the v1 behavior, the same
  trick `toSpreadsheetStepVersion` uses (`.catch(v1)`).
- **`version: "v2"` (new/edited flows)** → `text` holds a small, closed HTML
  subset (`<b> <i> <s> <code> <a href="…">`, plus escaped `&amp; &lt; &gt;
  &quot;`), paragraphs/hard breaks flattened to `\n` (no `<p>`/`<br>` in the
  stored string — keeps it a single-line-friendly value like before).

Rejected option 2 (separate field) because it doubles the write surface
(every producer — flow editor, import/export, worker validation — would
have to keep two fields in sync) for no benefit: a `version`-free `text` is
already indistinguishable from "no formatting", so there's nothing plain
`text` gives us that a discriminated `text` doesn't. Rejected option 3
(tiptap JSON) because seven of eight channels need *plain or lightly
transformed text*, not a document tree — every consumer would need a tiptap
renderer dependency (including backend workers that must stay UI-free), and
the JSON schema is tiptap's to change, not ours to pin a data contract to.

### Migration mechanism

Checked `packages/flow-config/src/migrations/` — the one existing migration
(`spreadsheet-write-mapping.ts`) is not a batch/DB migration at all: it's a
**pure step-upgrade function**, run lazily wherever a step is read (builder
load, worker execution) via `upgradeNodeSteps`/`tagNodeSpreadsheetWriteStepVersions`.
There is no cron/one-off script that rewrites stored rows.

`sendText` follows the same lazy pattern, but even lighter: it needs no
upgrade function at all, because absence of `version` **is** a complete,
correct v1 value — unlike the spreadsheet case (which had to convert a
`customFieldId` reference into a token), plain legacy text needs no
transformation to remain valid. So the only piece of "migration" logic is
`toSendTextStepVersion` (`z.enum(["v1","v2"]).catch("v1")`), used purely for
branching in the channel converters and the length validator. No entry was
added to `migrations/` because there's nothing to upgrade — this is called
out explicitly so a future reader doesn't go looking for one.

**`sendTextStepDefaultFn`'s version heuristic.** This one function
(`packages/flow-config/src/steps/send-text.ts`) is the single default-value
constructor for a `sendText` step, and it's called from two very different
places: the builder's "add step" menu (`allSteps[stepType].defaultFn(menuItem.props)`,
called with no props — a genuinely blank step for a human to type into) and
several programmatic producers that already have concrete text in hand
(`apps/worker`'s rich-response handler mirroring a message echoed back from
Messenger/etc., `packages/business`'s appointment-confirmation text, several
test fixtures). Those two shapes are distinguishable by one thing: whether
`text` was supplied. So the default is `version: "v2"` only when
`props.text === undefined`; any caller that hands in existing text gets
`version: undefined` (legacy) unless it opts in explicitly. Getting this
backwards would have meant AI/foreign-platform text — which can contain a
bare `<` or `&` — gets run through the rich-text parser downstream instead
of sent byte-for-byte like before. Covered in
`packages/flow-config/__tests__/rich-text.test.ts` ("sendTextStepDefaultFn
version heuristic").

## Supported subset

Bold, italic, strikethrough, monospace/code, link — the five marks that
survive conversion into every channel without loss of meaning:

| Mark | Stored tag | Telegram | WhatsApp | Others (plain) |
|---|---|---|---|---|
| Bold | `<b>` | `<b>` | `*text*` | `text` |
| Italic | `<i>` | `<i>` | `_text_` | `text` |
| Strikethrough | `<s>` | `<s>` | `~text~` | `text` |
| Code | `<code>` | `<code>` | `` `text` `` | `text` |
| Link | `<a href="…">` | `<a href="…">` | `text (url)` | `text (url)` |

Nothing else (headings, lists, blockquotes, images-in-text, colors,
underline — Telegram has no underline‑equivalent WhatsApp marker) is in
scope: every one of those either has no equivalent in WhatsApp's four-symbol
markdown or no equivalent in the six plain-text channels, so keeping the
subset small is what keeps the round-trip lossless everywhere instead of
silently degrading per channel.

The tiptap editor is configured to allow exactly these five marks and
disables every other StarterKit node (headings, lists, blockquote, code
block, horizontal rule) so the editor can never produce something the
subset can't represent.

## Per-channel behavior (all eight)

Implemented in `packages/flow-config/src/rich-text/`, a small
hand-rolled parser (`parseRichText`) that turns the stored string into an
AST (`text` / `element` nodes, `element.tag` ∈ `b|i|s|code|a`) — not a full
HTML parser, just enough for our closed grammar, and it works identically in
the browser (builder) and Node (workers/integrations) since it does no DOM
parsing (no `jsdom` dependency added to backend packages).

- **`telegram`**: `version: "v2"` → `parse_mode: "HTML"` + `text` passed
  through unchanged (already a Telegram-compatible HTML subset — Telegram
  supports exactly `<b> <i> <s> <code> <a href>`). `version` absent/`"v1"` →
  no `parse_mode`, `text` unchanged (today's behavior).
- **`whatsapp`**: `version: "v2"` → converted to WhatsApp's markdown
  (`*bold*`, `_italic_`, `~strike~`, `` `code` ``, links expanded to
  `text (url)`). `v1` → unchanged.
- **`api`, `instagram-facebook`, `instagram`, `messenger`, `tiktok`,
  `zalo`**: `version: "v2"` → rendered to plain text (tags stripped, marks
  dropped, links expanded to `text (url)`). `v1` → unchanged. This is the
  explicit "unknown/unsupported channel gets clean text" default the task
  called for — new channels added later inherit it automatically by calling
  the same `richTextToPlainText` helper instead of reading `step.text` raw.

`richTextToPlainText`/`richTextToWhatsappMarkdown`/`richTextToTelegramHtml`
all accept `(text, version)` and internally no-op for `v1`, so every call
site is a one-line wrap: `richTextToPlainText(step.text, step.version)`
instead of `step.text`.

## Length limit: visible text, not markup

`SEND_TEXT_MAX = 1000` (previously an inline `.max(1000)` in the schema,
extracted to a named constant in `send-text.ts`). For `v1` the check is
unchanged (`text.length`). For `v2`, `getVisibleTextLength` walks the parsed
AST and sums the length of text nodes only — `<b>hello</b>` counts as 5, not
14. Enforced via `.superRefine` on `sendTextStepSchema` so it runs
everywhere the schema is used (builder publish, worker import validation) —
not a hand-checked call site.

`TIKTOK_CARD_TITLE_MAX` (`packages/flow-config/src/channel-rules/tiktok-text-rules.ts`)
had the same bug in miniature — `Array.from(text).length` on raw text. Swept
and fixed the same way: `exceedsCardTitleMax` now measures the visible
length via `getVisibleTextLength(text, version)`. This is the systemic
sweep — the same "count markup as content" mistake existed in two places in
this file's blast radius; both are fixed.

## Escaping and safety

Two independent layers, because the string is not guaranteed to have come
from the tiptap editor — the flow-config schema is also validated by
worker-side flow import (`import-export/`) and can be written directly:

1. **Editor-side (client)**: `tiptapDocToRichText` builds the stored string
   directly from the tiptap `JSON` document (`editor.getJSON()`), not by
   round-tripping through `getHTML()`/DOMParser. It only ever emits the five
   allowed tags (because those are the only marks configured in the tiptap
   instance) and always escapes text-node content (`&`, `<`, `>`) through
   the same `escapeHtmlText` used by the parser's inverse — so the editor
   physically cannot produce a string outside the subset.
2. **Schema-side (client + server, every write path)**: `parseRichText`
   is a strict parser — any tag outside `b|i|s|code|a`, any attribute on
   those tags other than `href` on `a`, or a malformed `href` (checked
   against `z.url()`-equivalent parsing) fails to parse. `sendTextStepSchema`
   calls it inside `superRefine` for `version: "v2"` and rejects the step if
   parsing fails. This is what stops arbitrary HTML injected via a direct
   API/import call (not just the editor) from ever reaching Telegram's
   `parse_mode: "HTML"` sender — unparseable input never gets tagged `v2`
   successfully, so it can never reach `richTextToTelegramHtml` as trusted
   HTML.

Because `parseRichText` decodes entities up front and every renderer
re-escapes text nodes on the way back out (`escapeHtmlText` for Telegram,
plain concatenation with no re-escaping needed for plain text/WhatsApp
since those targets don't interpret `<`/`&` specially), user-typed `<`, `>`,
`&` inside a link's visible text or a paragraph can never be reinterpreted
as a tag boundary — round trip is parse → AST → escape-on-render, never
substring surgery on the original string.

## Scope actually implemented

- `packages/flow-config/src/rich-text/` (new): parser, AST, per-channel
  renderers, `getVisibleTextLength`.
- `packages/flow-config/src/steps/send-text.ts`: `version` field,
  `SEND_TEXT_MAX` constant, `superRefine` length check.
- `packages/flow-config/src/channel-rules/tiktok-text-rules.ts`: visible-length
  fix described above.
- `apps/builder/src/components/tiptap/rich-text-tiptap-editor.tsx` (new): a
  dedicated editor for this one step, **not** a change to the shared
  `TiptapEditor`/`TiptapEditorField` (see "What was deliberately not
  touched" below). Wired into
  `apps/builder/src/features/flows/react-flow/steps/send-text/editor.tsx`
  only, via a new `rich-text-editor-field.tsx` that keeps the step's
  `text`/`version` fields in sync on every keystroke. A small
  `rich-text-toolbar.tsx` (Bold/Italic/Strike/Code/Link) is the only place a
  mark can originate from in the UI — matching the five tags the parser
  accepts. `rich-text-doc.ts` flattens the two atom node types the editor
  also uses (`mention` for variable injection, `emoji`) into plain text
  before handing the document to flow-config's `tiptapDocToRichText`, so
  that module stays free of any tiptap-extension-specific knowledge.
  `extensions/variable-injection/rich-text-mention.ts` is the inverse:
  turns a stored `v2` string back into tiptap-loadable HTML with
  `{{variable}}` tokens restored as mention nodes, mirroring the existing
  plain-text `plainTextToParagraphHtmlWithVariableMentions`. Pasted rich
  formatting (Word/Docs/websites) is flattened to plain text on paste, same
  as every other tiptap field in the app — only the toolbar and keyboard
  shortcuts produce marks; this keeps the paste-sanitization surface
  identical to what already ships instead of adding a second one.
  The canvas step preview (`send-text/viewer.tsx`) also renders the real
  formatting now (via `richTextToTelegramHtml`, escaped, `dangerouslySetInnerHTML`)
  instead of showing literal tag characters.
- Eight channel handlers' `send-text.ts` (`api`, `instagram-facebook`,
  `instagram`, `messenger`, `telegram`, `tiktok`, `whatsapp`, `zalo`):
  swapped `step.text` for the appropriate `richTextTo*` call.
- Tests: `packages/flow-config/__tests__/rich-text.test.ts` (parser,
  renderers, visible length, tiktok fix, default-fn version heuristic),
  `apps/builder/src/components/tiptap/__tests__/` (atom flattening,
  mention round-trip), and one test per channel handler confirming its
  conversion + a `v1` passthrough test.

## What was deliberately not touched, and why

`TiptapEditor`/`TiptapEditorField` (`apps/builder/src/components/tiptap/`)
is shared by ~20 consumers beyond `sendText`: `execute-javascript` (a code
editor — must stay plain text), `get-user-data`, `ai-extract-data`,
`ai-generate-text(-agent)`, `ai-analyze-image`, `ai-edit-image`,
`ai-text-to-speech` model dialogs, `whatsapp-option-list`,
`whatsapp-flow`, `email` step, WhatsApp/Messenger message-template param
forms, IG/FB comment forms, IG story form, magic links, and the
page-element builder. Every one of those reads plain text out of
`onChange`/`getText()` today; several (execute-javascript, prompt fields)
would actively break if fed HTML. Changing the shared component's output
format would be exactly the "half-finished contract change" the task
warned against — so `sendText` gets its own small editor component instead,
built by copying `TiptapEditor`'s chrome (emoji picker, variable-mention
suggestion, paste handling) and swapping StarterKit's node/mark config plus
the `onUpdate` serializer. The other ~19 consumers are unmodified and keep
plain-text semantics exactly as before.

`integrations/telegram/src/schema.ts` and
`.../handlers/message/incoming-message.ts` were left alone per instruction
(another agent's territory) — `TelegramSendMessageRequest.parse_mode`
already existed and needed no schema change, so this wasn't a blocker.
`send-carousel.ts` (telegram) already sets `parse_mode: "HTML"` without
escaping card title/subtitle; that pre-existing gap is out of scope here
(different step type, not touched) but is worth a follow-up — noted, not
fixed, to keep this change's diff to `sendText` only.

## Known gap: no live length warning while typing

Before this change, `SEND_TEXT_MAX` was `z.string().max(1000)` directly on
`sendTextStepSchema`, so the builder's live form validation
(`zodResolver` over the schema used in `nodes/send-message.ts`'s
`z.discriminatedUnion`) rejected an over-length message as the author typed.
That refinement had to move out of `sendTextStepSchema` itself (see the
"kept a plain `ZodObject`" note above — a `.superRefine`-wrapped schema
can't be a discriminated-union member), into `send-text-validator.ts`,
which only runs at publish/import time. So `SEND_TEXT_MAX` and the tiktok
40-char rule are still enforced (publish is blocked exactly as before,
`refineSendTextRichText`/`refineTiktokSendTextStep`, tested in
`rich-text.test.ts`/`tiktok-text-rules.test.ts`) — what's lost is the
*live* character-count feedback while editing.

The natural fix is a small notice component next to `TiktokTitleNotice`
(same pattern: `useWatch` the text/version fields, compute
`getVisibleTextLength`, render a warning) rather than routing through
`zodResolver`. It wasn't added because it needs a new translation key, and
`apps/builder/messages/ru.json` /
`__tests__/i18n-messages.test.ts` were explicitly off-limits in this task
(another agent's territory) — adding an English-only key would leave the
locale files inconsistent. This is a UX gap, not a correctness or
data-safety one: publish-time validation still catches every case.
