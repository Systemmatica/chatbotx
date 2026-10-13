"use client"

import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import { moveViewId } from "../lib/view-state"
import type { ContactViewConfigInput } from "../schemas/config"
import type { ContactViewResource } from "../schemas/resource"

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

/**
 * The workspace's saved contact views and their mutations. Each mutation
 * toasts its own failure and resolves to the saved view (or `null`).
 */
export function useContactViews(
  workspaceId: string,
  initialViews: ContactViewResource[],
) {
  const t = useTranslations()
  const [views, setViews] = useState(initialViews)

  const replace = useCallback((view: ContactViewResource) => {
    setViews((current) =>
      current.some((item) => item.id === view.id)
        ? current.map((item) => (item.id === view.id ? view : item))
        : [...current, view],
    )
  }, [])

  const create = useCallback(
    async (name: string, config: ContactViewConfigInput) => {
      try {
        const view = await client.contactViewsAPI.createContactViewAPI({
          workspaceId,
          name,
          config,
        })
        replace(view)
        toast.success(t("contactViews.messages.created", { name: view.name }))
        return view
      } catch (error) {
        toast.error(errorMessage(error, t("contactViews.messages.saveFailed")))
        return null
      }
    },
    [workspaceId, replace, t],
  )

  const update = useCallback(
    async (
      viewId: string,
      data: { name?: string; config?: ContactViewConfigInput },
    ) => {
      try {
        const view = await client.contactViewsAPI.updateContactViewAPI({
          workspaceId,
          viewId,
          ...data,
        })
        replace(view)
        toast.success(t("contactViews.messages.saved", { name: view.name }))
        return view
      } catch (error) {
        toast.error(errorMessage(error, t("contactViews.messages.saveFailed")))
        return null
      }
    },
    [workspaceId, replace, t],
  )

  const duplicate = useCallback(
    async (viewId: string, name: string) => {
      try {
        const view = await client.contactViewsAPI.duplicateContactViewAPI({
          workspaceId,
          viewId,
          name,
        })
        replace(view)
        return view
      } catch (error) {
        toast.error(errorMessage(error, t("contactViews.messages.saveFailed")))
        return null
      }
    },
    [workspaceId, replace, t],
  )

  const remove = useCallback(
    async (viewId: string) => {
      try {
        await client.contactViewsAPI.deleteContactViewAPI({
          workspaceId,
          viewId,
        })
        setViews((current) => current.filter((view) => view.id !== viewId))
        return true
      } catch (error) {
        toast.error(
          errorMessage(error, t("contactViews.messages.deleteFailed")),
        )
        return false
      }
    },
    [workspaceId, t],
  )

  /** Moves a tab one step; optimistic, restored when the save fails. */
  const move = useCallback(
    async (viewId: string, direction: "left" | "right") => {
      const previous = views
      const ids = previous.map((view) => view.id)
      const orderedIds = moveViewId(ids, viewId, direction)
      if (orderedIds === ids) {
        return
      }
      const byId = new Map(previous.map((view) => [view.id, view]))
      setViews(
        orderedIds.flatMap((id) => {
          const view = byId.get(id)
          return view ? [view] : []
        }),
      )
      try {
        const { data } = await client.contactViewsAPI.reorderContactViewsAPI({
          workspaceId,
          orderedIds: [...orderedIds],
        })
        setViews(data)
      } catch (error) {
        setViews(previous)
        toast.error(errorMessage(error, t("contactViews.messages.saveFailed")))
      }
    },
    [views, workspaceId, t],
  )

  return { views, create, update, duplicate, remove, move }
}
