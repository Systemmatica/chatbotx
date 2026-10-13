"use client"

import { MAX_PINNED_FLOWS } from "@chatbotx.io/business/pinned-flow/ordering"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import { toast } from "sonner"
import useSWR, { useSWRConfig } from "swr"
import { client } from "@/lib/orpc/orpc"

export type PinnedFlow = { flowId: string; name: string; pinnedAt: Date }

const pinnedFlowsKey = (workspaceId: string) =>
  ["pinned-flows", workspaceId] as const

const fetchPinnedFlows = async (workspaceId: string) =>
  (await client.flowsAPI.listPinnedFlowsAPI({ workspaceId })).data

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined

/**
 * The member's pinned flows of a workspace (sidebar quick links). Every caller
 * shares one SWR cache entry, so pinning from the flows list or the flow
 * header updates the sidebar right away.
 */
export function usePinnedFlows(workspaceId: string, enabled = true) {
  const t = useTranslations()
  const { mutate } = useSWRConfig()
  const { data } = useSWR(
    enabled ? pinnedFlowsKey(workspaceId) : null,
    () => fetchPinnedFlows(workspaceId),
    { revalidateOnFocus: false },
  )
  const pinnedFlows = data ?? []

  const isPinned = useCallback(
    (flowId: string) => pinnedFlows.some((flow) => flow.flowId === flowId),
    [pinnedFlows],
  )

  const setPinned = useCallback(
    async (flow: { id: string; name: string }, pin: boolean) => {
      try {
        await mutate(
          pinnedFlowsKey(workspaceId),
          async () => {
            const input = { workspaceId, flowId: flow.id }
            if (pin) {
              await client.flowsAPI.pinFlowAPI(input)
            } else {
              await client.flowsAPI.unpinFlowAPI(input)
            }
            return await fetchPinnedFlows(workspaceId)
          },
          {
            optimisticData: (current: PinnedFlow[] | undefined = []) =>
              pin
                ? [
                    ...current.filter((item) => item.flowId !== flow.id),
                    { flowId: flow.id, name: flow.name, pinnedAt: new Date() },
                  ].slice(0, MAX_PINNED_FLOWS)
                : current.filter((item) => item.flowId !== flow.id),
            rollbackOnError: true,
            revalidate: false,
          },
        )
        toast.success(t(pin ? "pinnedFlows.pinned" : "pinnedFlows.unpinned"))
      } catch (error) {
        toast.error(
          errorCode(error) === "pinnedFlowLimitReached"
            ? t("pinnedFlows.limitReached", { max: MAX_PINNED_FLOWS })
            : t("pinnedFlows.error"),
        )
      }
    },
    [mutate, t, workspaceId],
  )

  return { pinnedFlows, isPinned, setPinned }
}
