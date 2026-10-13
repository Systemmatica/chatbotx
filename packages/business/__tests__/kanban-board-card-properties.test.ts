import {
  DEFAULT_KANBAN_CARD_PROPERTIES,
  kanbanCardDataNeeds,
  kanbanCardPropertiesSchema,
  resolveKanbanCardProperties,
} from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  listCards: vi.fn(),
  countCards: vi.fn(),
  listStatusValues: vi.fn(),
  listCardTags: vi.fn(),
  listCardLeadMagnets: vi.fn(),
  findLastByConversation: vi.fn(),
  resolveMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  kanbanBoardRepository: {
    findById: mocks.findById,
    listCards: mocks.listCards,
    countCards: mocks.countCards,
    listStatusValues: mocks.listStatusValues,
    listCardTags: mocks.listCardTags,
    listCardLeadMagnets: mocks.listCardLeadMagnets,
  },
  createMessageRepository: async () => ({
    findLastByConversation: mocks.findLastByConversation,
  }),
  getSafeSinceTime: () => undefined,
}))

vi.mock("../src/flow/current-step", () => ({
  currentFlowStepService: { resolveMany: mocks.resolveMany },
}))

import { kanbanBoardService } from "../src/kanban-board/service"

const board = (cardProperties: unknown) => ({
  id: "10",
  workspaceId: "1",
  name: "Board",
  customFieldId: "7",
  flowId: null,
  stages: [{ id: "s1", name: "Intro" }],
  cardProperties,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const since = new Date("2026-10-01T10:00:00Z")
const cardRow = (contactId: string, bucket: string | null) => ({
  contactId,
  fullName: `Contact ${contactId}`,
  avatar: null,
  bucket,
  channel: "telegram",
  lastMessageAt: null,
  conversationId: `conv-${contactId}`,
  conversationLastActivityAt: null,
  phoneNumber: "+100",
  statusUpdatedAt: since,
  currentFlowId: null,
  currentNodeId: null,
  currentNodeAt: null,
})

describe("card property settings", () => {
  test("a board without settings shows today's card", () => {
    expect(resolveKanbanCardProperties(null)).toEqual(
      DEFAULT_KANBAN_CARD_PROPERTIES,
    )
    expect(
      DEFAULT_KANBAN_CARD_PROPERTIES.map((property) => property.type),
    ).toEqual(["lastActivity", "currentStep"])
    expect(resolveKanbanCardProperties([])).toEqual([])
  })

  test("rejects a property listed twice and unknown properties", () => {
    expect(
      kanbanCardPropertiesSchema.safeParse([
        { type: "customField", customFieldId: "1" },
        { type: "customField", customFieldId: "1" },
      ]).success,
    ).toBe(false)
    expect(
      kanbanCardPropertiesSchema.safeParse([
        { type: "customField", customFieldId: "1" },
        { type: "customField", customFieldId: "2" },
        { type: "tags" },
      ]).success,
    ).toBe(true)
    expect(kanbanCardPropertiesSchema.safeParse([{ type: "x" }]).success).toBe(
      false,
    )
  })

  test("asks only for the data the properties show", () => {
    expect(
      kanbanCardDataNeeds([
        { type: "tags" },
        { type: "customField", customFieldId: "3" },
      ]),
    ).toEqual({
      customFieldIds: ["3"],
      tags: true,
      leadMagnets: false,
      phone: false,
      lastMessage: false,
      timeInStage: false,
      currentStep: false,
    })
  })
})

describe("kanbanBoardService.getCards card properties", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
    mocks.countCards.mockResolvedValue([{ bucket: "Intro", count: 1 }])
    mocks.resolveMany.mockResolvedValue([])
  })

  test("the default card loads the flow step and nothing else", async () => {
    mocks.findById.mockResolvedValue(board(null))
    mocks.listCards.mockResolvedValue([cardRow("c1", "Intro")])

    const { columns } = await kanbanBoardService.getCards({
      workspaceId: "1",
      boardId: "10",
    })

    expect(mocks.resolveMany).toHaveBeenCalledTimes(1)
    expect(mocks.listCardTags).not.toHaveBeenCalled()
    expect(mocks.listCardLeadMagnets).not.toHaveBeenCalled()
    expect(mocks.listStatusValues).not.toHaveBeenCalled()
    expect(mocks.findLastByConversation).not.toHaveBeenCalled()
    const card = columns.find((column) => column.id === "s1")?.cards[0]
    expect(card?.properties).toEqual({})
  })

  test("configured properties are loaded in one batch per kind", async () => {
    mocks.findById.mockResolvedValue(
      board([
        { type: "customField", customFieldId: "5" },
        { type: "tags" },
        { type: "leadMagnets" },
        { type: "phone" },
        { type: "timeInStage" },
        { type: "lastMessage" },
      ]),
    )
    mocks.listCards.mockResolvedValue([
      cardRow("c1", "Intro"),
      cardRow("c2", null),
    ])
    mocks.listStatusValues.mockResolvedValue([
      { contactId: "c1", customFieldId: "5", value: "Moscow" },
    ])
    mocks.listCardTags.mockResolvedValue([
      { contactId: "c1", id: "t1", name: "vip" },
      { contactId: "c1", id: "t2", name: "new" },
    ])
    mocks.listCardLeadMagnets.mockResolvedValue([
      { contactId: "c2", id: "lm1", name: "Checklist" },
    ])
    mocks.findLastByConversation.mockImplementation(
      async (conversationId: string) =>
        conversationId === "conv-c1"
          ? [
              {
                text: "Hello",
                messageType: "incoming",
                attachmentCount: 0,
                attachments: [],
                createdAt: since,
              },
            ]
          : [],
    )

    const { columns } = await kanbanBoardService.getCards({
      workspaceId: "1",
      boardId: "10",
      canViewPhone: false,
    })

    expect(mocks.resolveMany).not.toHaveBeenCalled()
    expect(mocks.listStatusValues).toHaveBeenCalledTimes(1)
    expect(mocks.listStatusValues).toHaveBeenCalledWith({
      customFieldIds: ["5"],
      contactIds: ["c1", "c2"],
    })
    expect(mocks.listCardTags).toHaveBeenCalledTimes(1)
    expect(mocks.listCardLeadMagnets).toHaveBeenCalledTimes(1)

    const inStage = columns.find((column) => column.id === "s1")?.cards[0]
    expect(inStage?.properties).toEqual({
      customFields: { "5": "Moscow" },
      tags: [
        { id: "t1", name: "vip" },
        { id: "t2", name: "new" },
      ],
      leadMagnets: [],
      phone: null,
      stageSince: since,
      lastMessage: {
        text: "Hello",
        messageType: "incoming",
        attachmentCount: 0,
        createdAt: since,
      },
    })

    const noStatus = columns.find((column) => column.isNoStatus)?.cards[0]
    expect(noStatus?.properties?.leadMagnets).toEqual([
      { id: "lm1", name: "Checklist" },
    ])
    expect(noStatus?.properties?.stageSince).toBeNull()
    expect(noStatus?.properties?.lastMessage).toBeNull()
  })
})
