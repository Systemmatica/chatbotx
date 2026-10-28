import { folderService } from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { notFoundException } from "@chatbotx.io/business/errors"
import { folderTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { resolveContactId } from "@/features/contacts/queries/public-find-contact"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { basePaginationRequest } from "@/lib/pagination"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createSequence } from "../actions/create-sequence.action"
import { deleteSequence } from "../actions/delete-sequence.action"
import { deleteSequenceStep } from "../actions/delete-sequence-step.action"
import { updateSequence } from "../actions/update-sequence.action"
import { upsertSequenceStep } from "../actions/upsert-sequence-step.action"
import { findWorkspaceSequence, listWorkspaceSequences } from "../queries"
import {
  createSequenceRequest,
  listSequencesResponse,
  updateSequenceSchema,
  upsertSequenceStepRequest,
} from "../schema/action"
import { sequenceWithStepsResource } from "../schema/resource"

const sequenceIdInput = z.object({ id: zodBigintAsString() })
const stepPathInput = sequenceIdInput.extend({ stepId: zodBigintAsString() })
const stepBody = upsertSequenceStepRequest.omit({
  stepId: true,
  sequenceId: true,
})

const contactSequencesResponse = z.object({
  data: z.array(z.object({ sequenceId: z.string(), sequenceName: z.string() })),
})

export const sequencesWorkspaceTokenAPIs = {
  listSequencesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/sequences",
      summary: "List sequences",
      tags: ["Sequences"],
    })
    .input(basePaginationRequest)
    .output(listSequencesResponse)
    .handler(
      async ({ context, input }) =>
        await listWorkspaceSequences({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  getSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/sequences/{id}",
      summary: "Get sequence details with its steps",
      tags: ["Sequences"],
    })
    .input(sequenceIdInput)
    .output(sequenceWithStepsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await findWorkspaceSequence(context.workspace.id, input.id),
    ),

  createSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/sequences",
      summary: "Create a sequence",
      successStatus: 201,
      tags: ["Sequences"],
    })
    .input(createSequenceRequest)
    .output(sequenceWithStepsResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      if (input.folderId) {
        await folderService.ensureExists({
          id: input.folderId,
          workspaceId,
          folderType: folderTypes.enum.sequence,
        })
      }

      const { sequenceId } = await createSequence(workspaceId, input)
      return await findWorkspaceSequence(workspaceId, sequenceId)
    }),

  updateSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/sequences/{id}",
      summary: "Rename, activate or deactivate a sequence",
      tags: ["Sequences"],
    })
    .input(updateSequenceSchema.extend(sequenceIdInput.shape))
    .output(sequenceWithStepsResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      await updateSequence({ workspaceId: context.workspace.id, id }, rest)
      return await findWorkspaceSequence(context.workspace.id, id)
    }),

  deleteSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/sequences/{id}",
      summary: "Delete a sequence",
      successStatus: 204,
      tags: ["Sequences"],
    })
    .input(sequenceIdInput)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await deleteSequence({ workspaceId: context.workspace.id, id: input.id })
    }),

  createSequenceStepWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/sequences/{id}/steps",
      summary: "Add a step to a sequence",
      successStatus: 201,
      tags: ["Sequences"],
    })
    .input(stepBody.extend(sequenceIdInput.shape))
    .output(z.object({ stepId: z.string() }))
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...step } = input
      return await upsertSequenceStep(context.workspace.id, {
        ...step,
        sequenceId: id,
      })
    }),

  updateSequenceStepWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/sequences/{id}/steps/{stepId}",
      summary:
        "Update a sequence step (order is required; omitted optional fields keep their value)",
      tags: ["Sequences"],
    })
    .input(stepBody.extend(stepPathInput.shape))
    .output(z.object({ stepId: z.string() }))
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...step } = input
      return await upsertSequenceStep(context.workspace.id, {
        ...step,
        sequenceId: id,
      })
    }),

  deleteSequenceStepWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/sequences/{id}/steps/{stepId}",
      summary: "Delete a sequence step",
      successStatus: 204,
      tags: ["Sequences"],
    })
    .input(stepPathInput)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await deleteSequenceStep(context.workspace.id, {
        sequenceId: input.id,
        stepId: input.stepId,
      })
    }),

  listContactSequencesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "List the sequences a contact is subscribed to",
      tags: ["Contacts", "Sequences"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(contactSequencesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId,
      })
      return {
        data: await contactSequenceService.listByContactId({
          workspaceId,
          contactId,
        }),
      }
    }),

  addContactToSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/sequences",
      summary: "Subscribe a contact to a sequence",
      tags: ["Contacts", "Sequences"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        sequenceId: zodBigintAsString(),
      }),
    )
    .output(contactSequencesResponse)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId,
      })
      // Enrollment ids come from the request: never enroll into a sequence
      // of another workspace.
      await findWorkspaceSequence(workspaceId, input.sequenceId)

      const current = await contactSequenceService.listByContactId({
        workspaceId,
        contactId,
      })
      const sequenceIds = new Set(current.map((row) => row.sequenceId))
      sequenceIds.add(input.sequenceId)

      // Same path as the contact detail screen: the service diffs the set,
      // enrolls with the first step scheduled and leaves others untouched.
      await contactSequenceService.updateContactSequences({
        workspaceId,
        contactId,
        sequenceIds: [...sequenceIds],
      })

      return {
        data: await contactSequenceService.listByContactId({
          workspaceId,
          contactId,
        }),
      }
    }),

  removeContactFromSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/sequences/{sequenceId}",
      summary: "Unsubscribe a contact from a sequence",
      successStatus: 204,
      tags: ["Contacts", "Sequences"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        sequenceId: zodBigintAsString(),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId,
      })
      const current = await contactSequenceService.listByContactId({
        workspaceId,
        contactId,
      })
      if (!current.some((row) => row.sequenceId === input.sequenceId)) {
        throw notFoundException("Contact is not subscribed to this sequence")
      }

      await contactSequenceService.removeContactSequencesForContact({
        workspaceId,
        contactId,
        sequenceIds: [input.sequenceId],
        reason: "enrollment_removed",
      })
    }),
}
