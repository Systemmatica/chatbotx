import {
  buttonTypes,
  type FlowExport,
  nodeTypeSchema,
  parseFlowExport,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { describe, expect, test } from "vitest"
import en from "../../../../../messages/en.json"
import ru from "../../../../../messages/ru.json"
import {
  buildFunnelCommonFlow,
  buildFunnelEntryFlows,
  FUNNEL_BUSINESS_FIELD_SOURCE_ID,
  FUNNEL_TEMPLATE_TEXT_KEYS,
  resolveFunnelTemplateTexts,
} from "../funnel-template"

const textsFrom = (messages: typeof en) =>
  resolveFunnelTemplateTexts((key) => {
    const value = messages.flowTemplates.funnel[key]
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Missing template text ${key}`)
    }
    return value
  })

const texts = textsFrom(ru as typeof en)

const parse = (built: FlowExport) => {
  const parsed = parseFlowExport(JSON.parse(JSON.stringify(built)))
  if (!parsed.ok) {
    throw new Error(parsed.reason)
  }
  const [flow] = parsed.data.flows
  return { flow, customFields: parsed.data.customFields }
}

const collectIds = (value: unknown, ids: string[] = []): string[] => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectIds(item, ids)
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "id" && typeof child === "string") {
        ids.push(child)
      }
      collectIds(child, ids)
    }
  }
  return ids
}

/** Every edge joins two blocks of the flow through a handle that exists. */
const expectWiredEdges = (flow: ReturnType<typeof parse>["flow"]) => {
  const nodeIds = new Set(flow.nodes.map((node) => node.id))
  for (const edge of flow.edges) {
    expect(nodeIds.has(edge.source)).toBe(true)
    expect(nodeIds.has(edge.target)).toBe(true)
    expect(edge.targetHandle).toBe(edge.target)
    const source = flow.nodes.find((node) => node.id === edge.source)
    if (edge.sourceHandle !== edge.source) {
      expect(JSON.stringify(source?.data)).toContain(`"${edge.sourceHandle}"`)
    }
  }
}

/** Buttons carry the same "go to block" route as their edge, like the canvas writes. */
const expectButtonRoutes = (flow: ReturnType<typeof parse>["flow"]) => {
  const buttonEdges = flow.edges.filter(
    (edge) => edge.sourceHandle !== edge.source,
  )
  expect(buttonEdges.length).toBeGreaterThan(0)
  for (const edge of buttonEdges) {
    const node = flow.nodes.find((item) => item.id === edge.source)
    const steps =
      node && "steps" in node.data.details ? node.data.details.steps : []
    const button = steps
      .flatMap((step) => ("buttons" in step ? step.buttons : []))
      .find((item) => item.id === edge.sourceHandle)
    expect(button?.buttonType).toBe(buttonTypes.enum.startAnotherNode)
    expect(
      button && "nodeId" in (button.beforeStep ?? {})
        ? (button.beforeStep as { nodeId: string }).nodeId
        : null,
    ).toBe(edge.target)
  }
}

describe("funnel template texts", () => {
  test.each([
    ["en", en],
    ["ru", ru as typeof en],
  ])("%s messages carry every template text", (_locale, messages) => {
    for (const key of FUNNEL_TEMPLATE_TEXT_KEYS) {
      expect(messages.flowTemplates.funnel[key]).toBeTruthy()
    }
  })
})

describe("buildFunnelCommonFlow", () => {
  test("is a valid flow export with a wired chain and an offer", () => {
    const { flow, customFields } = parse(buildFunnelCommonFlow(texts))

    expect(flow.name).toBe(texts.commonFlowName)
    const start = flow.nodes.find((node) => node.id === flow.startNodeId)
    expect(start?.data.isStartNode).toBe(true)
    expect(flow.nodes.filter((node) => node.data.isStartNode)).toHaveLength(1)
    expect(flow.nodes.map((node) => node.type)).toContain(
      nodeTypeSchema.enum.wait,
    )
    expectWiredEdges(flow)
    expectButtonRoutes(flow)

    // the business question saves into a custom field shipped in the manifest
    expect(customFields[FUNNEL_BUSINESS_FIELD_SOURCE_ID]).toEqual({
      name: texts.businessFieldName,
      type: "shortText",
    })
    expect(JSON.stringify(start?.data)).toContain(
      `"outputFieldId":"${FUNNEL_BUSINESS_FIELD_SOURCE_ID}"`,
    )
  })

  test("waits one day between the material and the follow-up", () => {
    const { flow } = parse(buildFunnelCommonFlow(texts))
    const wait = flow.nodes.find(
      (node) => node.type === nodeTypeSchema.enum.wait,
    )
    expect(wait?.data.details).toMatchObject({
      steps: [{ delayType: "duration", duration: 1, unit: "days" }],
    })
  })
})

describe("buildFunnelEntryFlows", () => {
  const commonFlowId = createId()
  const entries = buildFunnelEntryFlows(texts, commonFlowId).map(parse)

  test("builds three valid entry flows", () => {
    expect(entries.map(({ flow }) => flow.name)).toEqual([
      texts.siteEntryFlowName,
      texts.reelsEntryFlowName,
      texts.bookEntryFlowName,
    ])
    for (const { flow } of entries) {
      expect(
        flow.nodes.find((node) => node.id === flow.startNodeId)?.data
          .isStartNode,
      ).toBe(true)
      expectWiredEdges(flow)
    }
  })

  test("every entry ends by starting the common flow", () => {
    for (const { flow } of entries) {
      const handovers = flow.nodes.filter(
        (node) => node.type === nodeTypeSchema.enum.startFlow,
      )
      expect(handovers).toHaveLength(1)
      expect(handovers[0]?.data.details).toMatchObject({
        beforeStep: { stepType: "startExternalFlow", flowId: commonFlowId },
      })
      expect(flow.edges.some((edge) => edge.target === handovers[0]?.id)).toBe(
        true,
      )
    }
  })

  test("the book entry asks for a format and branches on two buttons", () => {
    const book = entries[2]?.flow
    expect(book).toBeDefined()
    if (!book) {
      return
    }
    expectButtonRoutes(book)
    const handover = book.nodes.find(
      (node) => node.type === nodeTypeSchema.enum.startFlow,
    )
    expect(
      book.edges.filter((edge) => edge.target === handover?.id),
    ).toHaveLength(2)
  })
})

test("two builds never share an id", () => {
  const first = collectIds([
    buildFunnelCommonFlow(texts),
    ...buildFunnelEntryFlows(texts, "1"),
  ])
  const second = collectIds([
    buildFunnelCommonFlow(texts),
    ...buildFunnelEntryFlows(texts, "1"),
  ])
  const firstSet = new Set(first)
  expect(firstSet.size).toBe(first.length)
  expect(second.some((id) => firstSet.has(id))).toBe(false)
})
