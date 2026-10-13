import { beforeEach, describe, expect, test, vi } from "vitest"

const repository = vi.hoisted(() => ({
  record: vi.fn(async () => undefined),
  recordTagEvent: vi.fn(async () => true),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactActivityRepository: repository,
}))

import { runWithActivityActor } from "../src/activity/context"
import {
  ActivityEventEmitter,
  toContactActivity,
} from "../src/activity/emitter"

describe("toContactActivity", () => {
  test("maps a custom field change with old and new values", () => {
    expect(
      toContactActivity("customFieldValueChanged", {
        customFieldId: "5",
        customFieldName: "City",
        oldValue: "Paris",
        newValue: "Rome",
      }),
    ).toEqual({
      type: "customFieldChanged",
      payload: {
        customFieldId: "5",
        customFieldName: "City",
        oldValue: "Paris",
        newValue: "Rome",
      },
    })
  })

  test("maps assignment with the assigning user as actor", () => {
    expect(
      toContactActivity("conversationAssigned", {
        conversationId: "c1",
        assignedTo: "u2",
        assignedBy: "u1",
      }),
    ).toEqual({
      type: "assignmentChanged",
      payload: { conversationId: "c1", assignedTo: "u2" },
      byUserId: "u1",
    })
  })

  test("maps unassignment to an empty assignee", () => {
    expect(
      toContactActivity("conversationUnassigned", { conversationId: "c1" }),
    ).toMatchObject({
      type: "assignmentChanged",
      payload: { assignedTo: null },
    })
  })

  test("maps archive to conversation closed", () => {
    expect(
      toContactActivity("archived", { conversationId: "c1", archivedBy: "u1" }),
    ).toEqual({
      type: "conversationClosed",
      payload: { conversationId: "c1" },
      byUserId: "u1",
    })
  })

  test("ignores events outside the activity log", () => {
    expect(toContactActivity("newContact", {})).toBeNull()
  })
})

describe("ActivityEventEmitter", () => {
  beforeEach(() => {
    repository.record.mockClear()
    repository.recordTagEvent.mockClear()
  })

  test("attributes a tag change to the request's user", async () => {
    await runWithActivityActor({ type: "user", userId: "u7" }, () =>
      ActivityEventEmitter.tagApplied("w1", "c1", "t1"),
    )
    expect(repository.recordTagEvent).toHaveBeenCalledWith({
      workspaceId: "w1",
      contactId: "c1",
      tagId: "t1",
      type: "tagAdded",
      actor: { type: "user", userId: "u7" },
    })
  })

  test("attributes changes outside a request context to the bot", async () => {
    await ActivityEventEmitter.tagRemoved("w1", "c1", "t1")
    expect(repository.recordTagEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tagRemoved", actor: { type: "bot" } }),
    )
  })

  test("prefers the explicit assigning user over the context actor", async () => {
    await runWithActivityActor({ type: "api" }, () =>
      ActivityEventEmitter.conversationAssigned("w1", "c1", "conv", "u2", "u1"),
    )
    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "assignmentChanged",
        actor: { type: "user", userId: "u1" },
      }),
    )
  })

  test("does not record events it does not support", async () => {
    await ActivityEventEmitter.contactCreated("w1", "c1")
    expect(repository.record).not.toHaveBeenCalled()
    expect(repository.recordTagEvent).not.toHaveBeenCalled()
  })
})
