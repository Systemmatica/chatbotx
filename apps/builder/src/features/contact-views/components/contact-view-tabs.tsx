"use client"

import { CONTACT_VIEW_NAME_MAX_LENGTH } from "@chatbotx.io/database/partials"
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
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"
import type { ContactViewResource } from "../schemas/resource"

type NameDialogState =
  | { mode: "create" }
  | { mode: "rename"; view: ContactViewResource }
  | { mode: "duplicate"; view: ContactViewResource }

type ContactViewTabsProps = {
  views: ContactViewResource[]
  /** `null` = the built-in "All" tab. */
  activeViewId: string | null
  /** The table differs from the active tab's saved state. */
  dirty: boolean
  canManage: boolean
  onSelect: (viewId: string | null) => void
  /** Saves the current table state as a new view. */
  onCreate: (name: string) => Promise<unknown>
  /** Overwrites the active view with the current table state. */
  onSave: () => Promise<unknown>
  /** Drops unsaved changes (re-applies the active tab). */
  onDiscard: () => void
  onRename: (viewId: string, name: string) => Promise<unknown>
  onDuplicate: (viewId: string, name: string) => Promise<unknown>
  onDelete: (viewId: string) => Promise<unknown>
  onMove: (viewId: string, direction: "left" | "right") => void
}

/**
 * Notion-style view tabs above the contacts table: "All" plus the
 * workspace's saved views, with save / save-as and a menu per view.
 */
export function ContactViewTabs({
  views,
  activeViewId,
  dirty,
  canManage,
  onSelect,
  onCreate,
  onSave,
  onDiscard,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
}: ContactViewTabsProps) {
  const t = useTranslations()
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null)
  const [deleting, setDeleting] = useState<ContactViewResource | null>(null)
  const [saving, setSaving] = useState(false)

  const activeView = views.find((view) => view.id === activeViewId) ?? null
  const dialogText = nameDialogText(nameDialog, t)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b">
      <nav
        aria-label={t("contactViews.title")}
        className="-mb-px flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        <TabButton
          active={activeViewId === null}
          label={t("contactViews.all")}
          onClick={() => onSelect(null)}
        />
        {views.map((view, index) => (
          <div className="flex shrink-0 items-center" key={view.id}>
            <TabButton
              active={view.id === activeViewId}
              label={view.name}
              onClick={() => onSelect(view.id)}
            />
            {canManage && view.id === activeViewId ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={t("contactViews.menu", { name: view.name })}
                      className="size-7"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ChevronDownIcon />
                    </Button>
                  }
                />
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem
                    onClick={() => setNameDialog({ mode: "rename", view })}
                  >
                    <PencilIcon />
                    {t("contactViews.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setNameDialog({ mode: "duplicate", view })}
                  >
                    <CopyIcon />
                    {t("contactViews.duplicate")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={index === 0}
                    onClick={() => onMove(view.id, "left")}
                  >
                    <ArrowLeftIcon />
                    {t("contactViews.moveLeft")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === views.length - 1}
                    onClick={() => onMove(view.id, "right")}
                  >
                    <ArrowRightIcon />
                    {t("contactViews.moveRight")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleting(view)}
                    variant="destructive"
                  >
                    <Trash2Icon />
                    {t("actions.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 pb-1">
        {dirty ? (
          <>
            <span className="text-muted-foreground text-xs">
              {t("contactViews.unsaved")}
            </span>
            <Button onClick={onDiscard} size="sm" type="button" variant="ghost">
              <Undo2Icon />
              {t("contactViews.discard")}
            </Button>
            {canManage && activeView ? (
              <Button
                disabled={saving}
                onClick={handleSave}
                size="sm"
                type="button"
                variant="outline"
              >
                <SaveIcon />
                {t("contactViews.save")}
              </Button>
            ) : null}
          </>
        ) : null}
        {canManage ? (
          <Button
            onClick={() => setNameDialog({ mode: "create" })}
            size="sm"
            type="button"
            variant={dirty && !activeView ? "default" : "outline"}
          >
            <PlusIcon />
            {t("contactViews.saveAs")}
          </Button>
        ) : null}
      </div>

      <ViewNameDialog
        initialName={dialogText.initialName}
        key={
          nameDialog
            ? `${nameDialog.mode}:${"view" in nameDialog ? nameDialog.view.id : ""}`
            : "closed"
        }
        onOpenChange={(open) => {
          if (!open) {
            setNameDialog(null)
          }
        }}
        onSubmit={async (name) => {
          if (!nameDialog) {
            return
          }
          if (nameDialog.mode === "create") {
            await onCreate(name)
          } else if (nameDialog.mode === "rename") {
            await onRename(nameDialog.view.id, name)
          } else {
            await onDuplicate(nameDialog.view.id, name)
          }
          setNameDialog(null)
        }}
        open={nameDialog !== null}
        title={dialogText.title}
      />

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
              {t("messages.deleteFeature", { feature: deleting?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("contactViews.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleting) {
                  await onDelete(deleting.id)
                }
                setDeleting(null)
              }}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function nameDialogText(
  dialog: NameDialogState | null,
  t: ReturnType<typeof useTranslations>,
): { title: string; initialName: string } {
  switch (dialog?.mode) {
    case "rename":
      return { title: t("contactViews.rename"), initialName: dialog.view.name }
    case "duplicate":
      return {
        title: t("contactViews.duplicate"),
        initialName: t("contactViews.copyName", { name: dialog.view.name }),
      }
    default:
      return { title: t("contactViews.saveAs"), initialName: "" }
  }
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "max-w-56 shrink-0 truncate border-b-2 px-3 py-2 font-medium text-sm transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {label}
    </button>
  )
}

function ViewNameDialog({
  open,
  title,
  initialName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  initialName: string
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => Promise<void>
}) {
  const t = useTranslations()
  const [name, setName] = useState(initialName)
  const [pending, setPending] = useState(false)
  const trimmed = name.trim()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!trimmed || pending) {
      return
    }
    setPending(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {t("contactViews.nameDescription")}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={t("contactViews.name")}
            autoFocus
            maxLength={CONTACT_VIEW_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("contactViews.namePlaceholder")}
            value={name}
          />
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={!trimmed || pending} type="submit">
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
