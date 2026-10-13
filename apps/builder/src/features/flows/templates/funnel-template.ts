import {
  applyRouteUpdatesInNodes,
  buttonStepDefaultFn,
  type EdgeSchema,
  FLOW_EXPORT_FORMAT_VERSION,
  type FlowExport,
  type FlowNode,
  type FlowVersionSchema,
  getUserDataStepDefaultFn,
  ReplyFormat,
  type SendMessageNodeSchema,
  sendMessageNodeDefaultFn,
  sendTextStepDefaultFn,
  startExternalFlowStepDefaultFn,
  startFlowNodeDefaultFn,
  waitNodeDefaultFn,
  waitStepDefaultFn,
  waitStepDelayUnits,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"

/**
 * "Funnel: 3 entries -> one common flow". A common nurture flow plus three
 * small entry flows (site lead magnet, reels keyword, book) that hand the
 * contact over to it. Built as flow-export documents so they go through the
 * same parser and import path as an uploaded export file.
 *
 * Every id (nodes, steps, buttons, states, edges) is minted per call, so
 * creating the template twice never shares an id between flows.
 */

/** Keys of the template copy under `flowTemplates.funnel` in the messages. */
export const FUNNEL_TEMPLATE_TEXT_KEYS = [
  "commonFlowName",
  "siteEntryFlowName",
  "reelsEntryFlowName",
  "bookEntryFlowName",
  "businessFieldName",
  "greetingBlock",
  "valueBlock",
  "waitBlock",
  "followUpBlock",
  "offerBlock",
  "offerYesBlock",
  "offerLaterBlock",
  "giftBlock",
  "handoverBlock",
  "formatBlock",
  "pdfBlock",
  "epubBlock",
  "greeting",
  "businessQuestion",
  "businessRetry",
  "businessThanks",
  "value",
  "followUp",
  "offer",
  "offerYesButton",
  "offerLaterButton",
  "offerYes",
  "offerLater",
  "siteGift",
  "reelsGift",
  "bookQuestion",
  "pdfButton",
  "epubButton",
  "pdf",
  "epub",
] as const

export type FunnelTemplateTextKey = (typeof FUNNEL_TEMPLATE_TEXT_KEYS)[number]

/** User-facing copy of the template; comes from the builder's messages. */
export type FunnelTemplateTexts = Record<FunnelTemplateTextKey, string>

/** Source id of the custom field the business question saves its answer to. */
export const FUNNEL_BUSINESS_FIELD_SOURCE_ID = "1"

const COLUMN_WIDTH = 420
const ROW_HEIGHT = 320

const at = (column: number, row = 0) => ({
  position: { x: 100 + column * COLUMN_WIDTH, y: 100 + row * ROW_HEIGHT },
})

const messageNode = (
  name: string,
  texts: string[],
  column: number,
  row = 0,
): SendMessageNodeSchema => {
  const node = sendMessageNodeDefaultFn({
    nodeProps: at(column, row),
    dataProps: { name },
  })
  node.data.details.steps = texts.map((text) => sendTextStepDefaultFn({ text }))
  return node
}

/** Edge leaving a block's own "next step" handle (whose id is the node id). */
const continueEdge = (source: string, target: string): EdgeSchema => ({
  id: createId(),
  source,
  sourceHandle: source,
  target,
  targetHandle: target,
})

const buttonEdge = (
  source: string,
  buttonId: string,
  target: string,
): EdgeSchema => ({
  id: createId(),
  source,
  sourceHandle: buttonId,
  target,
  targetHandle: target,
})

/**
 * Wires button handles the way the canvas does: an edge per button plus the
 * button's own "go to block" route, so runtime and editor agree.
 */
const routeButtons = (
  nodes: FlowVersionSchema[],
  routes: { source: string; buttonId: string; target: string }[],
): { nodes: FlowVersionSchema[]; edges: EdgeSchema[] } => ({
  nodes: applyRouteUpdatesInNodes(
    nodes as unknown as FlowNode[],
    routes.map((route) => ({
      sourceNodeId: route.source,
      handleId: route.buttonId,
      route: { targetNodeId: route.target },
    })),
  ) as unknown as FlowVersionSchema[],
  edges: routes.map((route) =>
    buttonEdge(route.source, route.buttonId, route.target),
  ),
})

/** Message block whose text step carries two buttons. */
const choiceNode = (
  name: string,
  text: string,
  labels: [string, string],
  column: number,
) => {
  const node = messageNode(name, [], column)
  const buttons = labels.map((label) => buttonStepDefaultFn({ label }))
  node.data.details.steps = [sendTextStepDefaultFn({ text, buttons })]
  return { node, buttonIds: buttons.map((button) => button.id) }
}

const toExport = (input: {
  name: string
  nodes: FlowVersionSchema[]
  edges: EdgeSchema[]
  customFields?: FlowExport["customFields"]
}): FlowExport => {
  const [start] = input.nodes
  if (!start) {
    throw new Error("A template flow needs at least one block")
  }
  start.data.isStartNode = true

  return {
    formatVersion: FLOW_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: "template", flowId: "funnelThreeEntries" },
    flows: [
      {
        name: input.name,
        active: true,
        enableInInbox: true,
        startNodeId: start.id,
        nodes: input.nodes,
        edges: input.edges,
      },
    ],
    customFields: input.customFields ?? {},
  }
}

/** The shared nurture flow every entry flow hands over to. */
export const buildFunnelCommonFlow = (
  texts: FunnelTemplateTexts,
): FlowExport => {
  const greeting = messageNode(texts.greetingBlock, [], 0)
  const question = getUserDataStepDefaultFn()
  question.message = texts.businessQuestion
  question.retryMessage = texts.businessRetry
  question.replyFormat = ReplyFormat.text
  question.outputFieldId = FUNNEL_BUSINESS_FIELD_SOURCE_ID
  greeting.data.details.steps = [
    sendTextStepDefaultFn({ text: texts.greeting }),
    question,
    sendTextStepDefaultFn({ text: texts.businessThanks }),
  ]

  const value = messageNode(texts.valueBlock, [texts.value], 1)

  const waitStep = waitStepDefaultFn()
  if (waitStep.delayType === "duration") {
    waitStep.duration = 1
    waitStep.unit = waitStepDelayUnits.enum.days
  }
  const wait = waitNodeDefaultFn({
    nodeProps: at(2),
    dataProps: { name: texts.waitBlock },
  })
  wait.data.details.steps = [waitStep]

  const followUp = messageNode(texts.followUpBlock, [texts.followUp], 3)
  const offer = choiceNode(
    texts.offerBlock,
    texts.offer,
    [texts.offerYesButton, texts.offerLaterButton],
    4,
  )
  const offerYes = messageNode(texts.offerYesBlock, [texts.offerYes], 5, 0)
  const offerLater = messageNode(
    texts.offerLaterBlock,
    [texts.offerLater],
    5,
    1,
  )

  const routed = routeButtons(
    [
      greeting,
      value,
      wait,
      followUp,
      offer.node,
      offerYes,
      offerLater,
    ] as FlowVersionSchema[],
    [
      {
        source: offer.node.id,
        buttonId: offer.buttonIds[0],
        target: offerYes.id,
      },
      {
        source: offer.node.id,
        buttonId: offer.buttonIds[1],
        target: offerLater.id,
      },
    ],
  )

  return toExport({
    name: texts.commonFlowName,
    nodes: routed.nodes,
    edges: [
      continueEdge(greeting.id, value.id),
      continueEdge(value.id, wait.id),
      continueEdge(wait.id, followUp.id),
      continueEdge(followUp.id, offer.node.id),
      ...routed.edges,
    ],
    customFields: {
      [FUNNEL_BUSINESS_FIELD_SOURCE_ID]: {
        name: texts.businessFieldName,
        type: "shortText",
      },
    },
  })
}

const handoverNode = (
  texts: FunnelTemplateTexts,
  commonFlowId: string,
  column: number,
) =>
  startFlowNodeDefaultFn({
    nodeProps: at(column),
    dataProps: { name: texts.handoverBlock },
    detailProps: {
      beforeStep: startExternalFlowStepDefaultFn({ flowId: commonFlowId }),
    },
  })

/** Single-message entry: deliver the promised material, then hand over. */
const giftEntryFlow = (
  texts: FunnelTemplateTexts,
  commonFlowId: string,
  name: string,
  gift: string,
): FlowExport => {
  const giftNode = messageNode(texts.giftBlock, [gift], 0)
  const handover = handoverNode(texts, commonFlowId, 1)
  return toExport({
    name,
    nodes: [giftNode, handover] as FlowVersionSchema[],
    edges: [continueEdge(giftNode.id, handover.id)],
  })
}

const bookEntryFlow = (
  texts: FunnelTemplateTexts,
  commonFlowId: string,
): FlowExport => {
  const format = choiceNode(
    texts.formatBlock,
    texts.bookQuestion,
    [texts.pdfButton, texts.epubButton],
    0,
  )
  const pdf = messageNode(texts.pdfBlock, [texts.pdf], 1, 0)
  const epub = messageNode(texts.epubBlock, [texts.epub], 1, 1)
  const handover = handoverNode(texts, commonFlowId, 2)

  const routed = routeButtons(
    [format.node, pdf, epub, handover] as FlowVersionSchema[],
    [
      { source: format.node.id, buttonId: format.buttonIds[0], target: pdf.id },
      {
        source: format.node.id,
        buttonId: format.buttonIds[1],
        target: epub.id,
      },
    ],
  )

  return toExport({
    name: texts.bookEntryFlowName,
    nodes: routed.nodes,
    edges: [
      ...routed.edges,
      continueEdge(pdf.id, handover.id),
      continueEdge(epub.id, handover.id),
    ],
  })
}

/** The three entry flows, each ending in "start flow" -> `commonFlowId`. */
export const buildFunnelEntryFlows = (
  texts: FunnelTemplateTexts,
  commonFlowId: string,
): FlowExport[] => [
  giftEntryFlow(texts, commonFlowId, texts.siteEntryFlowName, texts.siteGift),
  giftEntryFlow(texts, commonFlowId, texts.reelsEntryFlowName, texts.reelsGift),
  bookEntryFlow(texts, commonFlowId),
]

/** Resolves every text through `translate` (keys under `flowTemplates.funnel`). */
export const resolveFunnelTemplateTexts = (
  translate: (key: FunnelTemplateTextKey) => string,
): FunnelTemplateTexts =>
  Object.fromEntries(
    FUNNEL_TEMPLATE_TEXT_KEYS.map((key) => [key, translate(key)]),
  ) as FunnelTemplateTexts
