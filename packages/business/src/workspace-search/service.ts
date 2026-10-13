import {
  and,
  db,
  desc,
  eq,
  ilike,
  or,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  flowModel,
  leadMagnetModel,
} from "@chatbotx.io/database/schema"
import {
  likeContainsPattern,
  normalizeSearchQuery,
  phoneSearchFragment,
  rankSearchHits,
  tokenizeSearchQuery,
} from "./matching"

/** Results returned per group after ranking. */
export const WORKSPACE_SEARCH_GROUP_LIMIT = 5
/** Rows fetched per group before ranking, so the best matches can surface. */
const CANDIDATE_LIMIT = 25
/** Shorter contact queries would scan most of a large workspace. */
export const CONTACT_SEARCH_MIN_LENGTH = 2

export type WorkspaceSearchScope = {
  /** `null` when the member cannot see contacts. */
  contacts: {
    /** Members limited to their assigned contacts only find those. */
    restrictToAssignedUserId?: string
    /** Phone numbers are searched and returned only with this permission. */
    includePhone: boolean
  } | null
  flows: boolean
  leadMagnets: boolean
}

export type ContactSearchHit = {
  id: string
  name: string | null
  phoneNumber: string | null
  username: string | null
  avatar: string | null
  conversationId: string | null
}

export type FlowSearchHit = { id: string; name: string }

export type FlowNodeSearchHit = {
  flowId: string
  flowName: string
  nodeId: string
  nodeName: string
}

export type LeadMagnetSearchHit = { id: string; name: string }

export type WorkspaceSearchResult = {
  contacts: ContactSearchHit[]
  flows: FlowSearchHit[]
  flowNodes: FlowNodeSearchHit[]
  leadMagnets: LeadMagnetSearchHit[]
}

const emptyResult = (): WorkspaceSearchResult => ({
  contacts: [],
  flows: [],
  flowNodes: [],
  leadMagnets: [],
})

/** Every token must match one of the columns (AND of ORs). */
const everyTokenMatches = (
  tokens: readonly string[],
  columnsFor: (token: string) => SQL[],
): SQL[] => tokens.map((token) => or(...columnsFor(token)) ?? sql`FALSE`)

class WorkspaceSearchService {
  /**
   * Quick search across one workspace: contacts, flows, flow steps (by node
   * name in the draft version) and lead magnets. Groups the member has no
   * access to are skipped, not queried.
   */
  async search(input: {
    workspaceId: string
    query: string
    scope: WorkspaceSearchScope
    limit?: number
  }): Promise<WorkspaceSearchResult> {
    const query = normalizeSearchQuery(input.query)
    const tokens = tokenizeSearchQuery(query)
    if (tokens.length === 0) {
      return emptyResult()
    }

    const limit = input.limit ?? WORKSPACE_SEARCH_GROUP_LIMIT
    const { workspaceId, scope } = input

    const [contacts, flows, flowNodes, leadMagnets] = await Promise.all([
      scope.contacts && query.length >= CONTACT_SEARCH_MIN_LENGTH
        ? this.searchContacts({
            workspaceId,
            query,
            tokens,
            scope: scope.contacts,
          })
        : [],
      scope.flows ? this.searchFlows({ workspaceId, tokens }) : [],
      scope.flows ? this.searchFlowNodes({ workspaceId, tokens }) : [],
      scope.leadMagnets ? this.searchLeadMagnets({ workspaceId, tokens }) : [],
    ])

    return {
      contacts: rankSearchHits(
        contacts,
        query,
        (hit) => [
          hit.name,
          hit.username,
          hit.phoneNumber,
          hit.phoneNumber ? phoneSearchFragment(hit.phoneNumber) : null,
        ],
        limit,
      ),
      flows: rankSearchHits(flows, query, (hit) => [hit.name], limit),
      flowNodes: rankSearchHits(
        flowNodes,
        query,
        (hit) => [hit.nodeName],
        limit,
      ),
      leadMagnets: rankSearchHits(
        leadMagnets,
        query,
        (hit) => [hit.name],
        limit,
      ),
    }
  }

  private async searchContacts(input: {
    workspaceId: string
    query: string
    tokens: string[]
    scope: NonNullable<WorkspaceSearchScope["contacts"]>
  }): Promise<ContactSearchHit[]> {
    const { workspaceId, tokens, scope } = input

    const tokenConditions = everyTokenMatches(tokens, (token) => {
      const pattern = likeContainsPattern(token)
      const columns: SQL[] = [
        ilike(contactModel.firstName, pattern),
        ilike(contactModel.lastName, pattern),
        sql`EXISTS (SELECT 1 FROM ${contactInboxModel} WHERE ${contactInboxModel.contactId} = ${contactModel.id} AND ${contactInboxModel.sourceUsername} ILIKE ${pattern})`,
      ]
      const phone = scope.includePhone ? phoneSearchFragment(token) : null
      if (phone) {
        columns.push(
          ilike(contactModel.phoneNumber, likeContainsPattern(phone)),
        )
      }
      return columns
    })

    const assignedCondition = scope.restrictToAssignedUserId
      ? sql`EXISTS (SELECT 1 FROM ${conversationModel} WHERE ${conversationModel.contactId} = ${contactModel.id} AND ${conversationModel.assignedUserId} = ${scope.restrictToAssignedUserId})`
      : undefined

    const rows = await db
      .select({
        id: contactModel.id,
        name: contactModel.fullName,
        phoneNumber: contactModel.phoneNumber,
        avatar: contactModel.avatar,
        username: sql<
          string | null
        >`(SELECT ${contactInboxModel.sourceUsername} FROM ${contactInboxModel} WHERE ${contactInboxModel.contactId} = ${contactModel.id} AND ${contactInboxModel.sourceUsername} IS NOT NULL LIMIT 1)`,
        conversationId: sql<
          string | null
        >`(SELECT ${conversationModel.id}::text FROM ${conversationModel} WHERE ${conversationModel.contactId} = ${contactModel.id} ORDER BY ${conversationModel.lastActivityAt} DESC NULLS LAST LIMIT 1)`,
      })
      .from(contactModel)
      .where(
        and(
          eq(contactModel.workspaceId, workspaceId),
          ...tokenConditions,
          assignedCondition,
        ),
      )
      .orderBy(desc(contactModel.updatedAt))
      .limit(CANDIDATE_LIMIT)

    return rows.map((row) => ({
      ...row,
      phoneNumber: scope.includePhone ? row.phoneNumber : null,
    }))
  }

  private async searchFlows(input: {
    workspaceId: string
    tokens: string[]
  }): Promise<FlowSearchHit[]> {
    return await db
      .select({ id: flowModel.id, name: flowModel.name })
      .from(flowModel)
      .where(
        and(
          eq(flowModel.workspaceId, input.workspaceId),
          ...everyTokenMatches(input.tokens, (token) => [
            ilike(flowModel.name, likeContainsPattern(token)),
          ]),
        ),
      )
      .orderBy(desc(flowModel.updatedAt))
      .limit(CANDIDATE_LIMIT)
  }

  /** Steps are matched by node name inside each flow's draft (editable) version. */
  private async searchFlowNodes(input: {
    workspaceId: string
    tokens: string[]
  }): Promise<FlowNodeSearchHit[]> {
    const nodeName = sql`n.node->'data'->>'name'`
    const tokenConditions = input.tokens.map(
      (token) => sql`${nodeName} ILIKE ${likeContainsPattern(token)}`,
    )

    const result = await db.execute<{
      flowId: string
      flowName: string
      nodeId: string | null
      nodeName: string | null
    }>(sql`
      SELECT
        f."id"::text AS "flowId",
        f."name" AS "flowName",
        n.node->>'id' AS "nodeId",
        ${nodeName} AS "nodeName"
      FROM "Flow" f
      JOIN "FlowVersion" v
        ON v."id" = f."draftVersionId"
        AND v."workspaceId" = f."workspaceId"
      CROSS JOIN LATERAL unnest(v."nodes") AS n(node)
      WHERE f."workspaceId" = ${input.workspaceId}
        AND ${sql.join(tokenConditions, sql` AND `)}
      ORDER BY f."updatedAt" DESC
      LIMIT ${CANDIDATE_LIMIT}
    `)

    const hits: FlowNodeSearchHit[] = []
    for (const row of result.rows) {
      if (row.nodeId && row.nodeName) {
        hits.push({
          flowId: String(row.flowId),
          flowName: row.flowName,
          nodeId: row.nodeId,
          nodeName: row.nodeName,
        })
      }
    }
    return hits
  }

  private async searchLeadMagnets(input: {
    workspaceId: string
    tokens: string[]
  }): Promise<LeadMagnetSearchHit[]> {
    return await db
      .select({ id: leadMagnetModel.id, name: leadMagnetModel.name })
      .from(leadMagnetModel)
      .where(
        and(
          eq(leadMagnetModel.workspaceId, input.workspaceId),
          ...everyTokenMatches(input.tokens, (token) => [
            ilike(leadMagnetModel.name, likeContainsPattern(token)),
          ]),
        ),
      )
      .orderBy(desc(leadMagnetModel.updatedAt))
      .limit(CANDIDATE_LIMIT)
  }
}

export const workspaceSearchService = new WorkspaceSearchService()
