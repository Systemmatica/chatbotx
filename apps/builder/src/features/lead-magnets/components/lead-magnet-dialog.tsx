"use client"

import {
  LEAD_MAGNET_DESCRIPTION_MAX_LENGTH,
  LEAD_MAGNET_NAME_MAX_LENGTH,
  LEAD_MAGNET_URL_MAX_LENGTH,
  type LeadMagnetKind,
  leadMagnetKinds,
  leadMagnetTagName,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import { leadMagnetErrorMessage } from "../lib/lead-magnets"
import type { LeadMagnetResource } from "../schemas/resource"

type LeadMagnetDialogProps = {
  workspaceId: string
  /** `null` creates a new lead magnet. */
  leadMagnet: LeadMagnetResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function LeadMagnetDialog({
  workspaceId,
  leadMagnet,
  open,
  onOpenChange,
  onSaved,
}: LeadMagnetDialogProps) {
  const t = useTranslations()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<LeadMagnetKind>("other")
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset only when the dialog opens or switches lead magnet.
  useEffect(() => {
    if (!open) {
      return
    }
    setName(leadMagnet?.name ?? "")
    setKind(leadMagnet?.kind ?? "other")
    setUrl(leadMagnet?.url ?? "")
    setDescription(leadMagnet?.description ?? "")
  }, [open, leadMagnet])

  const kindOptions = useMemo(
    () =>
      leadMagnetKinds.options.map((value) => ({
        value,
        label: t(`leadMagnets.kinds.${value}`),
      })),
    [t],
  )

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error(t("leadMagnets.validation.nameRequired"))
      return
    }
    setIsSubmitting(true)
    try {
      const payload = {
        workspaceId,
        name: trimmedName,
        kind,
        url: url.trim() || null,
        description: description.trim() || null,
      }
      const saved = leadMagnet
        ? await client.leadMagnetsAPI.updateLeadMagnetAPI({
            ...payload,
            leadMagnetId: leadMagnet.id,
          })
        : await client.leadMagnetsAPI.createLeadMagnetAPI(payload)
      toast.success(
        t(leadMagnet ? "messages.updatedSuccess" : "messages.createdSuccess", {
          feature: saved.name,
        }),
      )
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(leadMagnetErrorMessage(error, t))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {leadMagnet ? t("leadMagnets.edit") : t("leadMagnets.create")}
          </DialogTitle>
          <DialogDescription>
            {t("leadMagnets.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="lead-magnet-name">{t("fields.name.label")}</Label>
            <Input
              id="lead-magnet-name"
              maxLength={LEAD_MAGNET_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("leadMagnets.namePlaceholder")}
              value={name}
            />
            <p className="text-muted-foreground text-xs">
              {t("leadMagnets.tagHint", {
                tag: leadMagnetTagName(name.trim() || "…"),
              })}
            </p>
          </div>

          <div className="grid gap-2">
            <Label>{t("leadMagnets.kind")}</Label>
            <Select
              items={kindOptions}
              onValueChange={(value) =>
                setKind(leadMagnetKinds.catch("other").parse(value))
              }
              value={kind}
            >
              <SelectTrigger
                aria-label={t("leadMagnets.kind")}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kindOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lead-magnet-url">{t("leadMagnets.url")}</Label>
            <Input
              id="lead-magnet-url"
              maxLength={LEAD_MAGNET_URL_MAX_LENGTH}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
              value={url}
            />
            <p className="text-muted-foreground text-xs">
              {t("leadMagnets.urlHint")}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lead-magnet-description">
              {t("fields.description.label")}
            </Label>
            <Textarea
              id="lead-magnet-description"
              maxLength={LEAD_MAGNET_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("fields.description.placeholder")}
              rows={3}
              value={description}
            />
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
            {leadMagnet ? t("actions.save") : t("actions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
