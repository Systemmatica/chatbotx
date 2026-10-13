import { logger } from "@chatbotx.io/ui/lib/logger"
import ky from "ky"
import type { LucideIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { CLEAR_VALUE } from "./constants"
import { FormFieldWrapper } from "./field-wrapper"

export type SingleSelectOption = {
  value: string
  label: string
  icon?: LucideIcon
  iconColor?: string
  disabled?: boolean
  /**
   * Label-color hints (CSS color values, e.g. `var(--label-red-fg)`): the
   * select shows a color dot, the multi-select colors its badges.
   */
  style?: {
    badgeColor?: string
    iconColor?: string
  }
}

export type SelectOption = SingleSelectOption & {
  children?: SelectOption[]
}

function SelectOptionIcon({ option }: { option: SingleSelectOption }) {
  if (option.icon) {
    return <option.icon className="h-4 w-4" fill={option.iconColor} />
  }
  if (option.style?.iconColor) {
    return (
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: option.style.iconColor }}
      />
    )
  }
  return " "
}

export type SelectFieldProps<T extends FieldValues> = React.ComponentProps<
  typeof Select
> & {
  name: FieldPath<T>
  label?: string
  placeholder?: string
  description?: string
  descriptionType?: "inline" | "tooltip"
  options?: SelectOption[]
  fetchOptionsUrl?: string
  formItemClassName?: string
  className?: string
  allowClear?: boolean
  clearLabel?: string
  triggerValueChange?: (value?: string) => void
  disableValues?: string[]
} & React.ComponentProps<typeof Select>

const SelectClear = ({
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectItem>, "value">) => (
  <SelectItem className="opacity-50" value={CLEAR_VALUE} {...props}>
    {children || "----"}
  </SelectItem>
)

export const SelectField = <T extends FieldValues>(
  props: SelectFieldProps<T>,
) => {
  const {
    name,
    label,
    required,
    placeholder,
    description,
    descriptionType = "inline",
    options = [],
    fetchOptionsUrl,
    formItemClassName,
    allowClear,
    clearLabel,
    triggerValueChange,
    disableValues,
    ...rest
  } = props

  const [fetchedOptions, setFetchedOptions] = useState<SelectOption[]>([])

  const normalizedOptions = useMemo<SelectOption[]>(
    () => (options.length > 0 ? options : fetchedOptions),
    [options, fetchedOptions],
  )

  const optionItems = useMemo(
    () =>
      normalizedOptions.map((option) => (
        <SelectItem
          disabled={option.disabled ?? disableValues?.includes(option.value)}
          key={option.value}
          value={option.value}
        >
          <SelectOptionIcon option={option} />
          {option.label}
        </SelectItem>
      )),
    [normalizedOptions, disableValues],
  )

  const items = useMemo(() => {
    const mappedItems = normalizedOptions.map((option) => ({
      label: option.label,
      value: option.value,
    }))

    if (allowClear) {
      mappedItems.unshift({
        label: clearLabel || "----",
        value: CLEAR_VALUE,
      })
    }

    return mappedItems
  }, [normalizedOptions, allowClear, clearLabel])

  useEffect(() => {
    if (!fetchOptionsUrl || options.length > 0) {
      return
    }

    let isCancelled = false

    const fetchOptions = async () => {
      try {
        const body = await ky
          .get<{ data: { id: string; name: string }[] }>(fetchOptionsUrl)
          .json()

        if (!isCancelled) {
          setFetchedOptions(
            body.data.map((v) => ({ value: v.id, label: v.name })),
          )
        }
      } catch (error) {
        if (!isCancelled) {
          logger.error(error, "Error fetching options:")
          setFetchedOptions([])
        }
      }
    }

    fetchOptions()

    return () => {
      isCancelled = true
    }
  }, [fetchOptionsUrl, options.length])

  return (
    <FormFieldWrapper<T>
      description={description}
      descriptionType={descriptionType}
      formItemClassName={formItemClassName}
      label={label}
      name={name}
      required={required}
    >
      {(field) => {
        const handleSelectChange = (value: unknown) => {
          if (value === CLEAR_VALUE) {
            field.onChange(undefined as T[FieldPath<T>])
            triggerValueChange?.(undefined)
            return
          }
          field.onChange(value as T[FieldPath<T>])
          triggerValueChange?.(value as string)
        }

        return (
          <Select
            items={items}
            onValueChange={handleSelectChange}
            value={field.value ?? ""}
            {...rest}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowClear ? <SelectClear>{clearLabel}</SelectClear> : null}
              {optionItems}
            </SelectContent>
          </Select>
        )
      }}
    </FormFieldWrapper>
  )
}
