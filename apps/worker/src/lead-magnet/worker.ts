// Path B: source-level merge for stage 1 (lead-magnet bot) — chat,
// integration, webhook, events, default, trigger, schedule share one
// Node process and, because this is bundled from source through the
// same tsdown pass, one copy of every dependency (Redis connection,
// Postgres pool, BullMQ, drizzle schema, etc.) instead of one copy per
// worker.
//
// Excluded on purpose (per the phased rollout):
//   ai-agent            — stage 2
//   sequence-producer    — stage 3 (broadcast warm-up)
//   sequence-consumer    — stage 3
//   sequence-scheduler   — stage 3
//
// Each imported module still self-registers its queue handler and its
// graceful-shutdown closer (see ../lib/graceful-shutdown.ts) — importing
// it here is what starts it, same as running its dist/*/worker.mjs
// standalone did.
import "../chat/worker"
import "../integration/worker"
import "../webhook/worker"
import "../events/worker"
import "../default/worker"
import "../trigger/worker"
import "../schedule/worker"
