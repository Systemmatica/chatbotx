import { notFoundException } from "@chatbotx.io/business/errors"
import { db, eq, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import {
  contactsOnSequenceModel,
  sequenceModel,
  sequenceStepModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListSequencesRequest,
  ListSequencesResponse,
} from "../schema/action"

export async function listSequences(
  input: ListSequencesRequest,
): Promise<ListSequencesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await listWorkspaceSequences(input)
}

/**
 * Lists sequences without the session check — for callers that authorized
 * the workspace another way (workspace token).
 */
export async function listWorkspaceSequences(
  input: ListSequencesRequest,
): Promise<ListSequencesResponse> {
  let folderIdFilter: string | { isNull: true } | undefined
  if (input.folderId) {
    folderIdFilter =
      input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
  }

  const where = {
    workspaceId: input.workspaceId,
    folderId: folderIdFilter,
    name: input.name
      ? {
          ilike: likeContains(input.name),
        }
      : undefined,
    active:
      input.active !== undefined && input.active !== null
        ? input.active
        : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(sequenceModel, input)

  const [data, total] = await Promise.all([
    db.query.sequenceModel.findMany({
      where,
      orderBy,
      ...pagination,
      extras: {
        stepsCount: (table) =>
          db.$count(
            sequenceStepModel,
            eq(sequenceStepModel.sequenceId, table.id),
          ),
        subscribersCount: (table) =>
          db.$count(
            contactsOnSequenceModel,
            eq(contactsOnSequenceModel.sequenceId, table.id),
          ),
      },
    }),
    db.$count(sequenceModel, relationsFilterToSQL(sequenceModel, where)),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}

export async function getSequence(workspaceId: string, sequenceId: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await findWorkspaceSequence(workspaceId, sequenceId)
}

/** Sequence with its ordered steps, without the session check. */
export async function findWorkspaceSequence(
  workspaceId: string,
  sequenceId: string,
) {
  const sequence = await db.query.sequenceModel.findFirst({
    where: {
      id: sequenceId,
      workspaceId,
    },
    with: {
      sequenceSteps: {
        with: {
          flow: true,
        },
        orderBy: (step, { asc }) => [asc(step.order)],
      },
    },
  })

  if (!sequence) {
    throw notFoundException("Sequence not found")
  }

  return {
    ...sequence,
    steps: sequence.sequenceSteps,
  }
}
