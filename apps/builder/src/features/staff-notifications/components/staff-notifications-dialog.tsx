"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import {
  CircleCheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import {
  STUCK_CONTACT_NOTIFY_HOUR_OPTIONS,
  type StaffNotificationSettingsResource,
  type StaffNotificationTypesResource,
} from "../schemas"

const POLL_INTERVAL_MS = 3000
/** Refresh the deep link this long before its code expires. */
const LINK_REFRESH_MARGIN_MS = 30_000

const TYPE_KEYS = [
  "newMessageToHuman",
  "notifyAdmin",
  "contactStuck",
] as const satisfies readonly (keyof StaffNotificationTypesResource)[]

type TelegramLink = { url: string; expiresAt: Date }

export function StaffNotificationsDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const [settings, setSettings] =
    useState<StaffNotificationSettingsResource | null>(null)
  const [link, setLink] = useState<TelegramLink | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const wasConnected = useRef(false)

  const loadSettings = useCallback(async () => {
    const next =
      await client.staffNotificationsAPI.getStaffNotificationSettingsAPI({
        workspaceId,
      })
    setSettings(next)
    return next
  }, [workspaceId])

  const createLink = useCallback(async () => {
    const next = await client.staffNotificationsAPI.createStaffTelegramLinkAPI({
      workspaceId,
    })
    setLink({ url: next.url, expiresAt: new Date(next.expiresAt) })
  }, [workspaceId])

  // Load on open; reset transient state on close.
  useEffect(() => {
    if (!open) {
      setWaiting(false)
      setLink(null)
      return
    }
    loadSettings()
      .then((next) => {
        wasConnected.current = next.connected
      })
      .catch(() => toast.error(t("staffNotifications.loadError")))
  }, [open, loadSettings, t])

  // Not connected yet: prepare a deep link so the button is a real anchor
  // (opens the Telegram app on phones, never trips a popup blocker).
  useEffect(() => {
    if (!(open && settings?.available) || settings.connected || link) {
      return
    }
    createLink().catch(() => toast.error(t("staffNotifications.saveError")))
  }, [open, settings, link, createLink, t])

  // Keep the link fresh while the dialog stays open.
  useEffect(() => {
    if (!link) {
      return
    }
    const delay = Math.max(
      0,
      link.expiresAt.getTime() - Date.now() - LINK_REFRESH_MARGIN_MS,
    )
    const timer = setTimeout(() => setLink(null), delay)
    return () => clearTimeout(timer)
  }, [link])

  // After "Connect" was pressed, poll until the bot reports the link.
  useEffect(() => {
    if (!(open && waiting)) {
      return
    }
    const timer = setInterval(() => {
      loadSettings()
        .then((next) => {
          if (next.connected && !wasConnected.current) {
            wasConnected.current = true
            setWaiting(false)
            setLink(null)
            toast.success(t("staffNotifications.connectedToast"))
          }
        })
        .catch(() => undefined)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [open, waiting, loadSettings, t])

  const disconnect = async () => {
    setBusy(true)
    try {
      await client.staffNotificationsAPI.disconnectStaffTelegramAPI({
        workspaceId,
      })
      wasConnected.current = false
      await loadSettings()
      toast.success(t("staffNotifications.disconnectedToast"))
    } catch {
      toast.error(t("staffNotifications.saveError"))
    } finally {
      setBusy(false)
    }
  }

  const toggleType = async (
    key: keyof StaffNotificationTypesResource,
    value: boolean,
  ) => {
    if (!settings) {
      return
    }
    const previous = settings
    setSettings({ ...settings, types: { ...settings.types, [key]: value } })
    try {
      const types =
        await client.staffNotificationsAPI.updateStaffNotificationTypesAPI({
          workspaceId,
          types: { [key]: value },
        })
      setSettings((current) => (current ? { ...current, types } : current))
    } catch {
      setSettings(previous)
      toast.error(t("staffNotifications.saveError"))
    }
  }

  const changeThreshold = async (hours: number) => {
    if (!settings) {
      return
    }
    const previous = settings
    setSettings({ ...settings, stuckContactNotifyHours: hours })
    try {
      const result =
        await client.staffNotificationsAPI.updateStuckContactThresholdAPI({
          workspaceId,
          hours,
        })
      setSettings((current) =>
        current
          ? { ...current, stuckContactNotifyHours: result.hours }
          : current,
      )
      toast.success(t("staffNotifications.saved"))
    } catch {
      setSettings(previous)
      toast.error(t("staffNotifications.saveError"))
    }
  }

  const thresholdItems = useMemo(() => {
    const options: number[] = [...STUCK_CONTACT_NOTIFY_HOUR_OPTIONS]
    // A value set outside the presets (e.g. via the API) stays selectable.
    if (settings && !options.includes(settings.stuckContactNotifyHours)) {
      options.push(settings.stuckContactNotifyHours)
      options.sort((a, b) => a - b)
    }
    return options.map((hours) => {
      let label: string
      if (hours === 0) {
        label = t("staffNotifications.stuckOff")
      } else if (hours % 24 === 0) {
        label = t("staffNotifications.stuckDays", { count: hours / 24 })
      } else {
        label = t("staffNotifications.stuckHours", { count: hours })
      }
      return { label, value: String(hours) }
    })
  }, [settings, t])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("staffNotifications.title")}</DialogTitle>
          <DialogDescription>
            {t("staffNotifications.description")}
          </DialogDescription>
        </DialogHeader>

        {settings ? (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3 rounded-lg border p-4">
              {settings.connected ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium text-sm">
                    <CircleCheckIcon className="size-4 text-green-600" />
                    {t("staffNotifications.connected")}
                  </span>
                  <Button
                    disabled={busy}
                    onClick={disconnect}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {busy && <Loader2Icon className="animate-spin" />}
                    {t("staffNotifications.disconnect")}
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    {t("staffNotifications.connectHint")}
                  </p>
                  {link ? (
                    <a
                      className={buttonVariants({ className: "w-full" })}
                      href={link.url}
                      onClick={() => setWaiting(true)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <SendIcon className="size-4" />
                      {t("staffNotifications.connect")}
                      <ExternalLinkIcon className="size-3.5 opacity-60" />
                    </a>
                  ) : (
                    <Button className="w-full" disabled type="button">
                      <Loader2Icon className="size-4 animate-spin" />
                      {t("staffNotifications.connect")}
                    </Button>
                  )}
                  {waiting && (
                    <p className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Loader2Icon className="size-3.5 animate-spin" />
                      {t("staffNotifications.waiting")}
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <Label>{t("staffNotifications.typesTitle")}</Label>
              {TYPE_KEYS.map((key) => (
                <label
                  className="flex cursor-pointer items-center justify-between gap-3 text-sm"
                  htmlFor={`staff-notification-${key}`}
                  key={key}
                >
                  <span>{t(`staffNotifications.types.${key}`)}</span>
                  <Switch
                    checked={settings.types[key]}
                    id={`staff-notification-${key}`}
                    onCheckedChange={(value) => toggleType(key, value)}
                  />
                </label>
              ))}
            </section>

            {settings.canManageWorkspace && (
              <section className="flex flex-col gap-2">
                <Label>{t("staffNotifications.stuckTitle")}</Label>
                <p className="text-muted-foreground text-xs">
                  {t("staffNotifications.stuckDescription")}
                </p>
                <Select
                  items={thresholdItems}
                  onValueChange={(value) => changeThreshold(Number(value))}
                  value={String(settings.stuckContactNotifyHours)}
                >
                  <SelectTrigger
                    aria-label={t("staffNotifications.stuckTitle")}
                    className="w-48"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {thresholdItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>
            )}
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
