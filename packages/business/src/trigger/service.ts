import { db, eq } from "@chatbotx.io/database/client"
import { triggerModel } from "@chatbotx.io/database/schema"
import type { TriggerModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"

export type TriggerDailyStat = {
  date: Date
  totalExecutions: number
  totalContacts: number
  successCount: number
  failureCount: number
}

class TriggerService extends BaseService {
  async listByWorkspaceId(workspaceId: string): Promise<TriggerModel[]> {
    return await db
      .select()
      .from(triggerModel)
      .where(eq(triggerModel.workspaceId, workspaceId))
  }

  /**
   * Daily execution counters the trigger executor writes to `TriggerStat`,
   * oldest first, optionally bounded by a date range.
   */
  async listDailyStats(input: {
    workspaceId: string
    triggerId: string
    from?: Date
    to?: Date
  }): Promise<TriggerDailyStat[]> {
    const dateFilter =
      input.from || input.to
        ? {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          }
        : undefined

    return await db.query.triggerStatsModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        triggerId: input.triggerId,
        date: dateFilter,
      },
      columns: {
        date: true,
        totalExecutions: true,
        totalContacts: true,
        successCount: true,
        failureCount: true,
      },
      orderBy: { date: "asc" },
    })
  }
}

export const triggerService = new TriggerService()
