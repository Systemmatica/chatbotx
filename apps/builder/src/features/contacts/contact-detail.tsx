"use client"

import {
  contactLanguageOptions,
  contactTimezoneOptions,
  normalizeStoredTimezone,
  offsetFromStoredTimezone,
} from "@chatbotx.io/business/contact-locale"
import type {
  ChannelType,
  CustomFieldOption,
  CustomFieldType,
  SelectCustomFieldType,
} from "@chatbotx.io/database/partials"
import {
  channelTypes,
  customFieldTypes,
  isSelectCustomFieldType,
} from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  formatCustomFieldValueInTimeZone,
  isTemporalCustomFieldType,
  resolveTemporalCustomFieldFormValue,
} from "@chatbotx.io/utils/datetime"
import {
  AtSignIcon,
  ClockIcon,
  FingerprintIcon,
  IdCardIcon,
  LanguagesIcon,
  type LucideIcon,
  PhoneIcon,
  TextIcon,
  UserRoundIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { getBrowserTimezone } from "../contact-filter/lib/timezone"
import type { ContactInboxResource } from "../contact-inboxes/schema/resource"
import { SelectValueChips } from "../custom-fields/components/select-value"
import { ContactCustomFieldManage } from "../custom-fields/contact-custom-field-manage"
import { resolveCustomFieldIcon } from "../custom-fields/lib/custom-field-icons"
import { useCustomFieldStore } from "../custom-fields/provider/custom-field-store-context"
import { EditContactField } from "./edit-contact-field"
import type { GetContactResponse } from "./schemas/query"
import type { ContactEditableField, ContactResource } from "./schemas/resource"
import { useAvatarUrl } from "./utils"

const formatGender = (
  gender: string | null | undefined,
  t: (key: string) => string,
) => {
  switch (gender) {
    case "male":
    case "female":
    case "unknown":
      return t(`fields.gender.${gender}`)
    default:
      return gender
  }
}

const formatTimezoneOffset = (timezone: string | null | undefined) => {
  const offset = offsetFromStoredTimezone(timezone)
  if (!offset) {
    return null
  }

  return offset.startsWith("-") || offset.startsWith("+")
    ? `UTC${offset}`
    : `UTC+${offset}`
}

const formatTimezoneLabel = (timezone: string | null | undefined) => {
  const normalizedTimezone = normalizeStoredTimezone(timezone)
  if (!normalizedTimezone) {
    return normalizedTimezone
  }

  const offsetLabel = formatTimezoneOffset(normalizedTimezone)
  return offsetLabel
    ? `${normalizedTimezone} (${offsetLabel})`
    : normalizedTimezone
}

const timezoneOptions = contactTimezoneOptions.map((option) => ({
  label: formatTimezoneLabel(option.value) ?? option.label,
  value: option.value,
}))

const getLanguageLabel = (
  language: string | null | undefined,
  t: (key: string) => string,
) => {
  const option = contactLanguageOptions.find((item) => item.value === language)
  return option ? t(option.labelKey) : language
}

type ScopedIdentityRowConfig = {
  key: "sourceUserId" | "sourceUsername"
  icon: LucideIcon
  labelKey: string
}

/**
 * Per-channel display config for the channel-scoped identity columns on
 * ContactInbox (`sourceUserId`/`sourceUsername`). Labels are channel-branded,
 * so each channel that populates these columns declares its own rows here —
 * adding a channel is one config entry, no branching.
 */
const scopedIdentityRowsByChannel: Partial<
  Record<ChannelType, readonly ScopedIdentityRowConfig[]>
> = {
  [channelTypes.enum.whatsapp]: [
    {
      key: "sourceUserId",
      icon: FingerprintIcon,
      labelKey: "fields.waUserId.label",
    },
    {
      key: "sourceUsername",
      icon: AtSignIcon,
      labelKey: "fields.waUserName.label",
    },
  ],
}

const buildScopedIdentityFields = (
  contactInbox: ContactInboxResource | undefined,
  t: (key: string) => string,
): ContactEditableField[] => {
  const parsedChannel = channelTypes.safeParse(contactInbox?.channel)
  if (!(contactInbox && parsedChannel.success)) {
    return []
  }
  const rows = scopedIdentityRowsByChannel[parsedChannel.data] ?? []
  return rows.flatMap((row): ContactEditableField[] => {
    const value = contactInbox[row.key]
    // Skip absent values, and a value that IS the Contact ID shown above
    // (a scoped-id-keyed contact) — no duplicate row.
    if (!value || value === contactInbox.sourceId) {
      return []
    }
    return [
      {
        key: row.key,
        icon: row.icon,
        label: t(row.labelKey),
        value,
        type: "shortText",
        readOnly: true,
      },
    ]
  })
}

/** Rough length past which a bio likely exceeds the 3-line clamp. */
const BIO_CLAMP_THRESHOLD = 120

/** Channel profile bio: muted, clamped to 3 lines with an expand toggle. */
/** Displayed value of a contact field: option chips for select fields. */
const ContactFieldValue = ({ field }: { field: ContactEditableField }) =>
  isSelectCustomFieldType(field.type) ? (
    <SelectValueChips
      className="min-w-0"
      options={field.selectOptions}
      type={field.type as SelectCustomFieldType}
      value={field.value}
    />
  ) : (
    <span className="truncate dark:text-white">{field.value}</span>
  )

const ContactBio = ({ bio }: { bio: string }) => {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)
  const collapsible = bio.length > BIO_CLAMP_THRESHOLD || bio.includes("\n")

  return (
    <div className="-mt-2 mb-4 flex flex-col items-center gap-0.5 px-2">
      <p
        className={`whitespace-pre-line break-words text-center text-muted-foreground text-xs ${expanded ? "" : "line-clamp-3"}`}
      >
        {bio}
      </p>
      {collapsible ? (
        <button
          className="text-[11px] text-primary hover:underline"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? t("actions.collapse") : t("actions.expand")}
        </button>
      ) : null}
    </div>
  )
}

export const ContactDetail = ({
  contact,
  baseContact,
  contactInbox,
  onEdited,
}: {
  contact: GetContactResponse | null
  /**
   * Live contact row (the inbox passes the chat store's copy so realtime
   * updates show); defaults to `contact`.
   */
  baseContact?: ContactResource | null
  /** Channel row shown first (the inbox passes the active chat's). */
  contactInbox?: ContactInboxResource | null
  /** A field was saved or removed here (drops an in-flight refresh). */
  onEdited?: () => void
}) => {
  const t = useTranslations()

  const workspaceId = useWorkspaceId()
  const sourceContact = baseContact ?? contact
  const avatarUrl = useAvatarUrl(contact)
  const [timezone, setTimezone] = useState("UTC")

  const [selectedField, setSelectedField] =
    useState<ContactEditableField | null>(null)

  const { customFields, initialized: initializedCustomFields } =
    useCustomFieldStore((state) => state)

  const [contactFields, setContactFields] = useState<ContactEditableField[]>([])
  // Custom fields added with "+" but not saved yet: the server does not know
  // them, so a background refresh of `contact` must not drop them.
  const [pendingFields, setPendingFields] = useState<ContactEditableField[]>([])
  const contactId = contact?.id
  // biome-ignore lint/correctness/useExhaustiveDependencies: contactId is the trigger — unsaved fields belong to the previous contact
  useEffect(() => {
    setPendingFields([])
  }, [contactId])

  useEffect(() => {
    setTimezone(getBrowserTimezone())
  }, [])

  const genderOptions = useMemo(
    () => [
      { label: t("fields.gender.male"), value: "male" },
      { label: t("fields.gender.female"), value: "female" },
      { label: t("fields.gender.unknown"), value: "unknown" },
    ],
    [t],
  )

  const languageOptions = useMemo(
    () =>
      contactLanguageOptions.map((option) => ({
        label: t(option.labelKey),
        value: option.value,
      })),
    [t],
  )

  const getContactFieldDisplayValue = (key: string, value: string) => {
    switch (key) {
      case "language":
        return getLanguageLabel(value, t)
      case "gender":
        return formatGender(value, t)
      case "timezone":
        return formatTimezoneLabel(value)
      default:
        return value
    }
  }

  const handleCustomFieldDeleted = (customFieldId: string) => {
    onEdited?.()
    setPendingFields((previous) =>
      previous.some((field) => field.key === customFieldId)
        ? previous.filter((field) => field.key !== customFieldId)
        : previous,
    )
    setContactFields((previous) =>
      previous.filter((field) => field.key !== customFieldId),
    )
  }

  const handleCustomFieldUpdated = (fieldKey: string, value: string) => {
    onEdited?.()
    const applyValue = (field: ContactEditableField): ContactEditableField => ({
      ...field,
      formValue: value,
      value: isTemporalCustomFieldType(field.type)
        ? formatCustomFieldValueInTimeZone(field.type, value, timezone)
        : getContactFieldDisplayValue(fieldKey, value),
    })
    // A just-added field stays pending (with its value) until a refreshed
    // contact lists it; other fields are left alone so nothing re-renders.
    setPendingFields((previous) =>
      previous.some((field) => field.key === fieldKey)
        ? previous.map((field) =>
            field.key === fieldKey ? applyValue(field) : field,
          )
        : previous,
    )
    setContactFields((previous) =>
      previous.map((field) =>
        field.key === fieldKey ? applyValue(field) : field,
      ),
    )
  }

  const handleChooseCustomField = (customFieldId: string) => {
    const targetCustomField = customFieldMap.get(customFieldId)
    if (!targetCustomField) {
      return
    }
    const field: ContactEditableField = {
      key: customFieldId,
      icon: resolveCustomFieldIcon(targetCustomField),
      label: targetCustomField.name,
      value: "",
      type: targetCustomField.type,
      selectOptions: targetCustomField.options ?? undefined,
    }
    setPendingFields((previous) => [...previous, field])
    setContactFields((previous) => [...previous, field])
  }

  const customFieldMap = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string
        type: CustomFieldType
        icon: string | null
        options: CustomFieldOption[] | null
      }
    >()
    for (const field of customFields) {
      const parsedType = customFieldTypes.safeParse(field.type)
      if (!parsedType.success) {
        continue
      }
      map.set(field.id.toString(), {
        name: field.name,
        type: parsedType.data,
        icon: field.icon,
        options: field.options ?? null,
      })
    }
    return map
  }, [customFields])

  useEffect(() => {
    if (initializedCustomFields) {
      if (sourceContact) {
        const activeContactInbox =
          contactInbox ?? contact?.contactInboxes?.[0] ?? undefined
        const channelContactId = activeContactInbox?.sourceId
        const tmpContactFields: ContactEditableField[] = [
          {
            key: "channelContactId",
            icon: IdCardIcon,
            label: t("fields.contactId.label"),
            value: channelContactId,
            type: "shortText",
            readOnly: true,
          },
          ...buildScopedIdentityFields(activeContactInbox, t),
          {
            key: "language",
            icon: LanguagesIcon,
            label: t("fields.language.label"),
            value: getLanguageLabel(activeContactInbox?.language, t),
            formValue: activeContactInbox?.language,
            contactInboxId: activeContactInbox?.id,
            options: languageOptions,
            type: "shortText",
          },
          {
            key: "gender",
            icon: UserRoundIcon,
            label: t("fields.gender.label"),
            value: formatGender(sourceContact.gender, t),
            formValue: sourceContact.gender,
            options: genderOptions,
            type: "shortText",
          },
          {
            key: "timezone",
            icon: ClockIcon,
            label: t("fields.timezone.label"),
            value: formatTimezoneLabel(sourceContact.timezone),
            formValue:
              normalizeStoredTimezone(sourceContact.timezone) ??
              sourceContact.timezone,
            options: timezoneOptions,
            type: "shortText",
          },
          {
            key: "email",
            icon: AtSignIcon,
            label: t("fields.email.label"),
            value: sourceContact.email,
            type: "shortText",
          },
          {
            key: "firstName",
            icon: TextIcon,
            label: t("fields.firstName.label"),
            value: sourceContact.firstName,
            type: "shortText",
          },
          {
            key: "lastName",
            icon: TextIcon,
            label: t("fields.lastName.label"),
            value: sourceContact.lastName,
            type: "shortText",
          },
          {
            key: "phoneNumber",
            icon: PhoneIcon,
            label: t("fields.phoneNumber.label"),
            value: sourceContact.phoneNumber,
            type: "shortText",
          },
        ]

        for (const contactCustomField of contact?.customFields ?? []) {
          const targetCustomField = customFieldMap.get(contactCustomField.id)
          if (targetCustomField) {
            tmpContactFields.push({
              key: contactCustomField.id,
              icon: resolveCustomFieldIcon(targetCustomField),
              label: targetCustomField.name,
              value: formatCustomFieldValueInTimeZone(
                targetCustomField.type,
                contactCustomField.value,
                timezone,
              ),
              formValue: isTemporalCustomFieldType(targetCustomField.type)
                ? resolveTemporalCustomFieldFormValue(
                    targetCustomField.type,
                    contactCustomField.value,
                  )
                : contactCustomField.value,
              type: targetCustomField.type,
              selectOptions: targetCustomField.options ?? undefined,
            })
          }
        }

        const shownKeys = new Set(tmpContactFields.map((field) => field.key))
        setContactFields([
          ...tmpContactFields,
          ...pendingFields.filter((field) => !shownKeys.has(field.key)),
        ])
      } else {
        setContactFields([])
      }
    } else {
      setContactFields([])
    }
  }, [
    sourceContact,
    contactInbox,
    initializedCustomFields,
    contact,
    pendingFields,
    customFieldMap,
    genderOptions,
    languageOptions,
    timezone,
    t,
  ])

  return contact ? (
    <div className="flex flex-col">
      <div className="my-5 flex justify-center">
        <Avatar className="size-24">
          <AvatarImage
            alt={contact.firstName ?? ""}
            className="object-cover"
            src={avatarUrl}
          />
          <AvatarFallback>NA</AvatarFallback>
        </Avatar>
      </div>
      {contact.bio ? <ContactBio bio={contact.bio} key={contact.id} /> : null}
      <div className="flex flex-col gap-1 font-medium text-[12px] text-gray-600">
        {contactFields.map((editable) => {
          const hasValue = Boolean(editable.value && editable.value.length > 0)
          const fieldValue = hasValue ? (
            <ContactFieldValue field={editable} />
          ) : (
            <span className="italic">
              {editable.readOnly ? "--" : `-- ${t("actions.clickToEdit")} --`}
            </span>
          )

          return (
            <div className="flex w-full items-center gap-1" key={editable.key}>
              <div className="flex basis-1/3 flex-wrap items-center gap-1 truncate">
                <editable.icon className="size-4" />
                <div className="flex-1 truncate dark:text-gray-400">
                  {editable.label}
                </div>
              </div>

              {editable.readOnly ? (
                <div className="inline-flex h-8 flex-1 items-center justify-start truncate rounded-md px-3 text-[12px] text-muted-foreground">
                  {fieldValue}
                </div>
              ) : (
                <Button
                  className="flex-1 justify-start truncate text-[12px]"
                  onClick={() => setSelectedField(editable)}
                  size="sm"
                  variant="ghost"
                >
                  {fieldValue}
                </Button>
              )}
            </div>
          )
        })}
        <ContactCustomFieldManage
          disabledIds={contactFields.map((field) => field.key)}
          onChooseCustomField={handleChooseCustomField}
          workspaceId={workspaceId}
        />
      </div>

      <EditContactField
        contactId={contact.id}
        onDeleted={handleCustomFieldDeleted}
        onOpenChange={() => setSelectedField(null)}
        onUpdated={handleCustomFieldUpdated}
        open={Boolean(selectedField)}
        targetField={selectedField}
        workspaceId={workspaceId}
      />
    </div>
  ) : null
}
