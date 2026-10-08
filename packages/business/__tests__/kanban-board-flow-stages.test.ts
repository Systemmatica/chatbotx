import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByFlowIds: vi.fn(),
  listStatusValues: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  kanbanBoardRepository: {
    listByFlowIds: mocks.listByFlowIds,
    listStatusValues: mocks.listStatusValues,
  },
}))

import { kanbanBoardService } from "../src/kanban-board/service"

const board = (id: string, flowId: string, customFieldId: string) => ({
  id,
  flowId,
  customFieldId,
  workspaceId: "1",
  name: `Board ${id}`,
  stages: [
    { id: "s1", name: "Intro", color: "#3b82f6" },
    { id: "s2", name: "Offer", color: "#22c55e", outcome: "won" as const },
    { id: "s3", name: "Blocked", outcome: "lost" as const, matchBlocked: true },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe("kanbanBoardService.resolveFlowStages", () => {
  beforeEach(() => {
    mocks.listByFlowIds.mockReset()
    mocks.listStatusValues.mockReset()
  })

  test("labels each contact with the stage on the first board of its flow", async () => {
    mocks.listByFlowIds.mockResolvedValue([
      board("10", "100", "f1"),
      board("11", "100", "f2"),
    ])
    mocks.listStatusValues.mockResolvedValue([
      { contactId: "c1", customFieldId: "f1", value: "Offer" },
      { contactId: "c2", customFieldId: "f1", value: "Unknown" },
      { contactId: "c3", customFieldId: "f2", value: "Intro" },
    ])

    const stages = await kanbanBoardService.resolveFlowStages({
      workspaceId: "1",
      refs: [
        { contactId: "c1", flowId: "100" },
        { contactId: "c2", flowId: "100" },
        { contactId: "c3", flowId: "100" },
        { contactId: "c4", flowId: null },
      ],
    })

    expect(mocks.listByFlowIds).toHaveBeenCalledWith({
      workspaceId: "1",
      flowIds: ["100"],
    })
    expect(stages[0]).toEqual({
      boardId: "10",
      stageId: "s2",
      name: "Offer",
      color: "#22c55e",
      outcome: "won",
    })
    // Value matching no stage, a value in another board's field, no flow.
    expect(stages.slice(1)).toEqual([null, null, null])
  })

  test("blocked contacts land on the stage that collects blocked contacts", async () => {
    mocks.listByFlowIds.mockResolvedValue([board("10", "100", "f1")])
    mocks.listStatusValues.mockResolvedValue([
      { contactId: "c1", customFieldId: "f1", value: "Intro" },
    ])

    const [stage] = await kanbanBoardService.resolveFlowStages({
      workspaceId: "1",
      refs: [{ contactId: "c1", flowId: "100", blocked: true }],
    })

    expect(stage).toMatchObject({ stageId: "s3", outcome: "lost" })
  })

  test("skips the value lookup when no flow has a board", async () => {
    mocks.listByFlowIds.mockResolvedValue([])

    const stages = await kanbanBoardService.resolveFlowStages({
      workspaceId: "1",
      refs: [{ contactId: "c1", flowId: "100" }],
    })

    expect(stages).toEqual([null])
    expect(mocks.listStatusValues).not.toHaveBeenCalled()
  })
})
