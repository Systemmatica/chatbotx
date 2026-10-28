import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPI, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  return {
    workspaceTokenAuthAPI: {
      route: vi.fn((config: RouteConfig) => makeProcedure(config)),
    },
    capturedProcedures,
  }
})

const mocks = vi.hoisted(() => ({
  folderService: { ensureExists: vi.fn() },
  contactSequenceService: {
    listByContactId: vi.fn(),
    updateContactSequences: vi.fn(),
    removeContactSequencesForContact: vi.fn(),
  },
  resolveContactId: vi.fn(),
  createSequence: vi.fn(),
  deleteSequence: vi.fn(),
  deleteSequenceStep: vi.fn(),
  updateSequence: vi.fn(),
  upsertSequenceStep: vi.fn(),
  findWorkspaceSequence: vi.fn(),
  listWorkspaceSequences: vi.fn(),
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@chatbotx.io/business", () => ({
  folderService: mocks.folderService,
}))
vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: mocks.contactSequenceService,
}))
vi.mock("@/features/contacts/queries/public-find-contact", () => ({
  resolveContactId: mocks.resolveContactId,
}))
vi.mock("@/features/sequences/actions/create-sequence.action", () => ({
  createSequence: mocks.createSequence,
}))
vi.mock("@/features/sequences/actions/delete-sequence.action", () => ({
  deleteSequence: mocks.deleteSequence,
}))
vi.mock("@/features/sequences/actions/delete-sequence-step.action", () => ({
  deleteSequenceStep: mocks.deleteSequenceStep,
}))
vi.mock("@/features/sequences/actions/update-sequence.action", () => ({
  updateSequence: mocks.updateSequence,
}))
vi.mock("@/features/sequences/actions/upsert-sequence-step.action", () => ({
  upsertSequenceStep: mocks.upsertSequenceStep,
}))
vi.mock("@/features/sequences/queries", () => ({
  findWorkspaceSequence: mocks.findWorkspaceSequence,
  listWorkspaceSequences: mocks.listWorkspaceSequences,
}))

await import("@/features/sequences/api/workspace-token")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const context = { workspace: { id: "ws-1" } }
const sequence = { id: "seq-1", workspaceId: "ws-1", steps: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findWorkspaceSequence.mockResolvedValue(sequence)
  mocks.resolveContactId.mockResolvedValue("contact-1")
})

describe("GET /v1/sequences", () => {
  const procedure = findProcedure("GET", "/v1/sequences")

  test("lists without the session-only access check", async () => {
    mocks.listWorkspaceSequences.mockResolvedValueOnce({
      data: [],
      pageCount: 0,
    })

    await procedure.handler?.({ context, input: { page: 1 } })

    expect(mocks.listWorkspaceSequences).toHaveBeenCalledWith({
      page: 1,
      workspaceId: "ws-1",
    })
  })
})

describe("GET /v1/sequences/{id}", () => {
  const procedure = findProcedure("GET", "/v1/sequences/{id}")

  test("returns the sequence with its steps", async () => {
    await expect(
      procedure.handler?.({ context, input: { id: "seq-1" } }),
    ).resolves.toBe(sequence)
    expect(mocks.findWorkspaceSequence).toHaveBeenCalledWith("ws-1", "seq-1")
  })
})

describe("POST /v1/sequences", () => {
  const procedure = findProcedure("POST", "/v1/sequences")

  test("checks the folder, creates, and returns the new sequence", async () => {
    mocks.createSequence.mockResolvedValueOnce({ sequenceId: "seq-1" })

    await expect(
      procedure.handler?.({
        context,
        input: { name: "Onboarding", folderId: "folder-1" },
      }),
    ).resolves.toBe(sequence)
    expect(mocks.folderService.ensureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "ws-1",
      folderType: "sequence",
    })
    expect(mocks.createSequence).toHaveBeenCalledWith("ws-1", {
      name: "Onboarding",
      folderId: "folder-1",
    })
  })
})

describe("sequence steps", () => {
  test("POST /v1/sequences/{id}/steps creates through upsertSequenceStep", async () => {
    const procedure = findProcedure("POST", "/v1/sequences/{id}/steps")
    mocks.upsertSequenceStep.mockResolvedValueOnce({ stepId: "step-1" })

    await expect(
      procedure.handler?.({
        context,
        input: { id: "seq-1", order: 0, delayUnit: "days", delayDays: 1 },
      }),
    ).resolves.toEqual({ stepId: "step-1" })
    expect(mocks.upsertSequenceStep).toHaveBeenCalledWith("ws-1", {
      sequenceId: "seq-1",
      order: 0,
      delayUnit: "days",
      delayDays: 1,
    })
  })

  test("PUT /v1/sequences/{id}/steps/{stepId} updates the given step", async () => {
    const procedure = findProcedure("PUT", "/v1/sequences/{id}/steps/{stepId}")

    await procedure.handler?.({
      context,
      input: { id: "seq-1", stepId: "step-1", order: 2 },
    })

    expect(mocks.upsertSequenceStep).toHaveBeenCalledWith("ws-1", {
      sequenceId: "seq-1",
      stepId: "step-1",
      order: 2,
    })
  })

  test("DELETE /v1/sequences/{id}/steps/{stepId} deletes the step", async () => {
    const procedure = findProcedure(
      "DELETE",
      "/v1/sequences/{id}/steps/{stepId}",
    )

    await procedure.handler?.({
      context,
      input: { id: "seq-1", stepId: "step-1" },
    })

    expect(mocks.deleteSequenceStep).toHaveBeenCalledWith("ws-1", {
      sequenceId: "seq-1",
      stepId: "step-1",
    })
  })
})

describe("POST /v1/contacts/{identifier}/sequences", () => {
  const procedure = findProcedure("POST", "/v1/contacts/{identifier}/sequences")

  test("adds the sequence to the contact's current set", async () => {
    mocks.contactSequenceService.listByContactId
      .mockResolvedValueOnce([{ sequenceId: "seq-0", sequenceName: "Old" }])
      .mockResolvedValueOnce([])

    await procedure.handler?.({
      context,
      input: { identifier: "id:contact-1", sequenceId: "seq-1" },
    })

    expect(mocks.findWorkspaceSequence).toHaveBeenCalledWith("ws-1", "seq-1")
    expect(
      mocks.contactSequenceService.updateContactSequences,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      sequenceIds: ["seq-0", "seq-1"],
    })
  })

  test("refuses a sequence from another workspace", async () => {
    mocks.findWorkspaceSequence.mockRejectedValueOnce(
      new Error("Sequence not found"),
    )

    await expect(
      procedure.handler?.({
        context,
        input: { identifier: "id:contact-1", sequenceId: "foreign" },
      }),
    ).rejects.toThrow("Sequence not found")
    expect(
      mocks.contactSequenceService.updateContactSequences,
    ).not.toHaveBeenCalled()
  })
})

describe("DELETE /v1/contacts/{identifier}/sequences/{sequenceId}", () => {
  const procedure = findProcedure(
    "DELETE",
    "/v1/contacts/{identifier}/sequences/{sequenceId}",
  )

  test("unsubscribes through the shared removal path", async () => {
    mocks.contactSequenceService.listByContactId.mockResolvedValueOnce([
      { sequenceId: "seq-1", sequenceName: "Onboarding" },
    ])

    await procedure.handler?.({
      context,
      input: { identifier: "id:contact-1", sequenceId: "seq-1" },
    })

    expect(
      mocks.contactSequenceService.removeContactSequencesForContact,
    ).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      sequenceIds: ["seq-1"],
      reason: "enrollment_removed",
    })
  })

  test("404s when the contact is not subscribed", async () => {
    mocks.contactSequenceService.listByContactId.mockResolvedValueOnce([])

    await expect(
      procedure.handler?.({
        context,
        input: { identifier: "id:contact-1", sequenceId: "seq-1" },
      }),
    ).rejects.toMatchObject({ httpStatusCode: 404 })
  })
})
