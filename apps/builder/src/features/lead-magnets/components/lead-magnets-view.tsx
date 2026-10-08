"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  ExternalLinkIcon,
  Loader2Icon,
  MagnetIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import {
  leadMagnetContactsHref,
  leadMagnetErrorMessage,
} from "../lib/lead-magnets"
import type { LeadMagnetWithStatsResource } from "../schemas/resource"
import { LeadMagnetDialog } from "./lead-magnet-dialog"

type LeadMagnetsViewProps = {
  workspaceId: string
  canManage: boolean
}

export function LeadMagnetsView({
  workspaceId,
  canManage,
}: LeadMagnetsViewProps) {
  const t = useTranslations()
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnetWithStatsResource[]>(
    [],
  )
  const [loaded, setLoaded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LeadMagnetWithStatsResource | null>(
    null,
  )
  const [deleting, setDeleting] = useState<LeadMagnetWithStatsResource | null>(
    null,
  )
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await client.leadMagnetsAPI.listLeadMagnetsAPI({
        workspaceId,
      })
      setLeadMagnets(data)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("messages.errorLoadingData"),
      )
    } finally {
      setLoaded(true)
    }
  }, [workspaceId, t])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (leadMagnet: LeadMagnetWithStatsResource) => {
    setEditing(leadMagnet)
    setDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleting) {
      return
    }
    setIsDeleting(true)
    try {
      await client.leadMagnetsAPI.deleteLeadMagnetAPI({
        workspaceId,
        leadMagnetId: deleting.id,
      })
      toast.success(t("messages.deletedSuccess", { feature: deleting.name }))
      setDeleting(null)
      await load()
    } catch (error) {
      toast.error(leadMagnetErrorMessage(error, t))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h4 className="font-bold text-xl">{t("leadMagnets.title")}</h4>
          <p className="max-w-2xl text-muted-foreground text-sm">
            {t("leadMagnets.description")}
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreate} type="button">
            <PlusIcon />
            {t("leadMagnets.create")}
          </Button>
        ) : null}
      </div>

      {loaded ? null : (
        <div className="flex justify-center py-12">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {loaded && leadMagnets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
          <MagnetIcon className="size-10 text-muted-foreground" />
          <h5 className="font-semibold">{t("leadMagnets.empty.title")}</h5>
          <p className="max-w-md text-muted-foreground text-sm">
            {t("leadMagnets.empty.description")}
          </p>
          {canManage ? (
            <Button onClick={openCreate} type="button" variant="secondary">
              <PlusIcon />
              {t("leadMagnets.create")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {loaded && leadMagnets.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.name.label")}</TableHead>
                <TableHead>{t("leadMagnets.kind")}</TableHead>
                <TableHead>{t("leadMagnets.url")}</TableHead>
                <TableHead className="text-right">
                  {t("leadMagnets.recipients")}
                </TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadMagnets.map((leadMagnet) => (
                <TableRow key={leadMagnet.id}>
                  <TableCell className="max-w-xs align-top">
                    <div className="font-medium">{leadMagnet.name}</div>
                    {leadMagnet.tagName ? (
                      <div className="text-muted-foreground text-xs">
                        {t("leadMagnets.tagLabel", {
                          tag: leadMagnet.tagName,
                        })}
                      </div>
                    ) : (
                      <div className="text-destructive text-xs">
                        {t("leadMagnets.tagMissing")}
                      </div>
                    )}
                    {leadMagnet.description ? (
                      <div className="mt-1 line-clamp-2 whitespace-normal text-muted-foreground text-xs">
                        {leadMagnet.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="secondary">
                      {t(`leadMagnets.kinds.${leadMagnet.kind}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[16rem] align-top">
                    {leadMagnet.url ? (
                      <a
                        className="inline-flex max-w-full items-center gap-1 text-primary text-sm hover:underline"
                        href={leadMagnet.url}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={leadMagnet.url}
                      >
                        <span className="truncate">{leadMagnet.url}</span>
                        <ExternalLinkIcon className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top font-medium tabular-nums">
                    {leadMagnet.recipients}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center justify-end gap-1">
                      {leadMagnet.tagId && leadMagnet.tagName ? (
                        <Link
                          className={buttonVariants({
                            size: "sm",
                            variant: "outline",
                          })}
                          href={leadMagnetContactsHref(
                            workspaceId,
                            leadMagnet.tagId,
                          )}
                        >
                          <UsersIcon />
                          {t("leadMagnets.showContacts")}
                        </Link>
                      ) : null}
                      {canManage ? (
                        <>
                          <Button
                            aria-label={t("actions.edit")}
                            onClick={() => openEdit(leadMagnet)}
                            size="icon"
                            title={t("actions.edit")}
                            type="button"
                            variant="ghost"
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            aria-label={t("actions.delete")}
                            onClick={() => setDeleting(leadMagnet)}
                            size="icon"
                            title={t("actions.delete")}
                            type="button"
                            variant="ghost"
                          >
                            <Trash2Icon />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {canManage ? (
        <LeadMagnetDialog
          leadMagnet={editing}
          onOpenChange={setDialogOpen}
          onSaved={load}
          open={dialogOpen}
          workspaceId={workspaceId}
        />
      ) : null}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
          }
        }}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("leadMagnets.deleteTitle", { name: deleting?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("leadMagnets.deleteDescription", {
                tag: deleting?.tagName ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={confirmDelete}>
              {isDeleting ? <Loader2Icon className="animate-spin" /> : null}
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
