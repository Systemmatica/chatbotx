"use client"

import {
  type KanbanStage,
  kanbanStagesSchema,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@chatbotx.io/ui/components/ui/sortable"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  BanIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  GripVerticalIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { client } from "@/lib/orpc/orpc"
import { createStageId } from "../lib/columns"
import {
  buildTemplateStages,
  type KanbanTemplateId,
  kanbanTemplateIds,
} from "../lib/templates"
import type { KanbanBoardResource } from "../schemas/resource"

type FieldMode = "existing" | "new"

const NEXT_OUTCOME: Record<string, KanbanStage["outcome"]> = {
  none: "won",
  won: "lost",
  lost: null,
}

type KanbanBoardDialogProps = {
  workspaceId: string
  /** `null` creates a new board. */
  board: KanbanBoardResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (board: KanbanBoardResource) => void
  /** New boards are created as this flow's funnel. */
  flowId?: string | null
  /** Preset applied when creating a board. */
  defaultTemplate?: KanbanTemplateId
}

export function KanbanBoardDialog({
  workspaceId,
  board,
  open,
  onOpenChange,
  onSaved,
  flowId,
  defaultTemplate = "simple",
}: KanbanBoardDialogProps) {
  const t = useTranslations()
  const customFields = useCustomFieldStore((state) => state.customFields)
  const refreshCustomFields = useCustomFieldStore(
    (state) => state.getAllCustomFields,
  )
  const shortTextFields = useMemo(
    () => customFields.filter((field) => field.type === "shortText"),
    [customFields],
  )

  const [name, setName] = useState("")
  const [fieldMode, setFieldMode] = useState<FieldMode>("existing")
  const [customFieldId, setCustomFieldId] = useState("")
  const [newFieldName, setNewFieldName] = useState("")
  const [stages, setStages] = useState<KanbanStage[]>([])
  const [template, setTemplate] = useState<KanbanTemplateId>(defaultTemplate)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset the form only when the dialog opens or switches board, not when the
  // custom field list or translations refresh while the user is editing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional, see above
  useEffect(() => {
    if (!open) {
      return
    }
    if (board) {
      setName(board.name)
      setFieldMode("existing")
      setCustomFieldId(board.customFieldId)
      setStages(board.stages)
      setNewFieldName(t("kanban.defaultFieldName"))
    } else {
      applyTemplate(defaultTemplate)
    }
  }, [open, board])

  // A funnel template brings its own stages and status field: a new field is
  // proposed so each funnel keeps its own status values.
  const applyTemplate = (next: KanbanTemplateId) => {
    setTemplate(next)
    setName(t(`kanban.templates.${next}.boardName`))
    setFieldMode("new")
    setCustomFieldId("")
    setNewFieldName(t(`kanban.templates.${next}.fieldName`))
    setStages(buildTemplateStages(next, (key) => t(key)))
  }

  const templateOptions = useMemo(
    () =>
      kanbanTemplateIds.map((id) => ({
        label: t(`kanban.templates.${id}.label`),
        value: id,
      })),
    [t],
  )

  const fieldOptions = useMemo(
    () =>
      shortTextFields.map((field) => ({ label: field.name, value: field.id })),
    [shortTextFields],
  )

  const updateStage = (id: string, patch: Partial<KanbanStage>) => {
    setStages((current) =>
      current.map((stage) =>
        stage.id === id ? { ...stage, ...patch } : stage,
      ),
    )
  }

  const addStage = () => {
    setStages((current) => [
      ...current,
      { id: createStageId(), name: "", color: "#64748b" },
    ])
  }

  // Only one stage may collect contacts who blocked the bot.
  const toggleMatchBlocked = (id: string) => {
    setStages((current) =>
      current.map((stage) => ({
        ...stage,
        matchBlocked: stage.id === id ? !stage.matchBlocked : null,
      })),
    )
  }

  const removeStage = (id: string) => {
    setStages((current) => current.filter((stage) => stage.id !== id))
  }

  const moveStage = (from: number, to: number) => {
    setStages((current) => {
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const validate = (): KanbanStage[] | null => {
    if (!name.trim()) {
      toast.error(t("kanban.validation.nameRequired"))
      return null
    }
    if (fieldMode === "existing" && !customFieldId) {
      toast.error(t("kanban.validation.fieldRequired"))
      return null
    }
    if (fieldMode === "new" && !newFieldName.trim()) {
      toast.error(t("kanban.validation.fieldRequired"))
      return null
    }
    const parsed = kanbanStagesSchema.safeParse(stages)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      if (stages.length === 0) {
        toast.error(t("kanban.validation.stagesRequired"))
      } else if (issue?.path.at(-1) === "name" && issue.code === "custom") {
        toast.error(t("kanban.validation.duplicateStageNames"))
      } else {
        toast.error(t("kanban.validation.emptyStageName"))
      }
      return null
    }
    return parsed.data
  }

  const handleSubmit = async () => {
    const validStages = validate()
    if (!validStages) {
      return
    }
    setIsSubmitting(true)
    try {
      const saved = board
        ? await client.kanbanAPI.updateKanbanBoardAPI({
            workspaceId,
            boardId: board.id,
            name: name.trim(),
            stages: validStages,
            customFieldId,
          })
        : await client.kanbanAPI.createKanbanBoardAPI({
            workspaceId,
            name: name.trim(),
            stages: validStages,
            flowId: flowId ?? null,
            ...(fieldMode === "existing"
              ? { customFieldId }
              : { newCustomFieldName: newFieldName.trim() }),
          })

      if (!board && fieldMode === "new") {
        await refreshCustomFields()
      }
      toast.success(
        t(board ? "messages.updatedSuccess" : "messages.createdSuccess", {
          feature: saved.name,
        }),
      )
      onSaved(saved)
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("messages.unknownError"),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {board ? t("kanban.editBoard") : t("kanban.newBoard")}
          </DialogTitle>
          <DialogDescription>{t("kanban.boardDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          {board ? null : (
            <div className="grid gap-2">
              <Label>{t("kanban.template")}</Label>
              <Select
                items={templateOptions}
                onValueChange={(value) =>
                  applyTemplate(String(value) as KanbanTemplateId)
                }
                value={template}
              >
                <SelectTrigger
                  aria-label={t("kanban.template")}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templateOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {t("kanban.templateDescription")}
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="kanban-board-name">{t("fields.name.label")}</Label>
            <Input
              id="kanban-board-name"
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("fields.name.placeholder")}
              value={name}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("kanban.statusField")}</Label>
            <p className="text-muted-foreground text-xs">
              {t("kanban.statusFieldDescription")}
            </p>
            {board ? null : (
              <RadioGroup
                className="flex gap-4"
                onValueChange={(value) => setFieldMode(value as FieldMode)}
                value={fieldMode}
              >
                <Label className="flex items-center gap-2 font-normal">
                  <RadioGroupItem
                    disabled={shortTextFields.length === 0}
                    value="existing"
                  />
                  {t("kanban.fieldMode.existing")}
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <RadioGroupItem value="new" />
                  {t("kanban.fieldMode.new")}
                </Label>
              </RadioGroup>
            )}
            {fieldMode === "existing" ? (
              <Select
                items={fieldOptions}
                onValueChange={(value) => setCustomFieldId(String(value ?? ""))}
                value={customFieldId}
              >
                <SelectTrigger
                  aria-label={t("kanban.statusField")}
                  className="w-full"
                >
                  <SelectValue placeholder={t("actions.pleaseSelect")} />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  className="max-h-64 min-w-(--anchor-width)"
                >
                  {fieldOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                aria-label={t("kanban.newFieldName")}
                maxLength={255}
                onChange={(event) => setNewFieldName(event.target.value)}
                placeholder={t("kanban.newFieldName")}
                value={newFieldName}
              />
            )}
            {board || shortTextFields.length > 0 ? null : (
              <p className="text-muted-foreground text-xs">
                {t("kanban.noShortTextFields")}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>{t("kanban.stages")}</Label>
            <p className="text-muted-foreground text-xs">
              {t("kanban.stagesDescription")}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("kanban.stageMarkersDescription")}
            </p>
            <Sortable
              getItemValue={(stage: KanbanStage) => stage.id}
              onMove={({ activeIndex, overIndex }) =>
                moveStage(activeIndex, overIndex)
              }
              value={stages}
            >
              <SortableContent>
                <div className="flex flex-col gap-2">
                  {stages.map((stage) => (
                    <SortableItem
                      key={stage.id}
                      render={
                        <div className="flex items-center gap-2">
                          <SortableItemHandle
                            render={
                              <Button
                                aria-label={t("actions.move")}
                                className="size-8 shrink-0"
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <GripVerticalIcon className="size-4" />
                              </Button>
                            }
                          />
                          <input
                            aria-label={t("kanban.stageColor")}
                            className="size-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                            onChange={(event) =>
                              updateStage(stage.id, {
                                color: event.target.value,
                              })
                            }
                            type="color"
                            value={stage.color ?? "#64748b"}
                          />
                          <Input
                            aria-label={t("kanban.stageName")}
                            maxLength={100}
                            onChange={(event) =>
                              updateStage(stage.id, {
                                name: event.target.value,
                              })
                            }
                            placeholder={t("kanban.stageName")}
                            value={stage.name}
                          />
                          <Button
                            aria-label={t(
                              `kanban.outcome.${stage.outcome ?? "none"}`,
                            )}
                            className={cn(
                              "size-8 shrink-0",
                              stage.outcome === "won" && "text-green-600",
                              stage.outcome === "lost" && "text-red-600",
                            )}
                            onClick={() =>
                              updateStage(stage.id, {
                                outcome: NEXT_OUTCOME[stage.outcome ?? "none"],
                              })
                            }
                            size="icon"
                            title={t(`kanban.outcome.${stage.outcome ?? "none"}`)}
                            type="button"
                            variant="ghost"
                          >
                            <OutcomeIcon outcome={stage.outcome} />
                          </Button>
                          <Button
                            aria-label={t("kanban.matchBlocked")}
                            aria-pressed={Boolean(stage.matchBlocked)}
                            className={cn(
                              "size-8 shrink-0",
                              stage.matchBlocked
                                ? "text-red-600"
                                : "text-muted-foreground",
                            )}
                            onClick={() => toggleMatchBlocked(stage.id)}
                            size="icon"
                            title={t("kanban.matchBlocked")}
                            type="button"
                            variant="ghost"
                          >
                            <BanIcon className="size-4" />
                          </Button>
                          <Button
                            aria-label={t("actions.remove")}
                            className="size-8 shrink-0"
                            disabled={stages.length <= 1}
                            onClick={() => removeStage(stage.id)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </div>
                      }
                      value={stage.id}
                    />
                  ))}
                </div>
              </SortableContent>
            </Sortable>
            <Button
              className="w-full"
              onClick={addStage}
              type="button"
              variant="secondary"
            >
              <PlusIcon />
              {t("kanban.addStage")}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} type="button">
            {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            {board ? t("actions.save") : t("actions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OutcomeIcon({ outcome }: { outcome: KanbanStage["outcome"] }) {
  if (outcome === "won") {
    return <CircleCheckIcon className="size-4" />
  }
  if (outcome === "lost") {
    return <CircleXIcon className="size-4" />
  }
  return <CircleDashedIcon className="size-4" />
}
