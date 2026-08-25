"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import type { SendTextStepVersionSchema } from "@chatbotx.io/flow-config"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { RichTextTiptapEditor } from "./rich-text-tiptap-editor"

const TEXT_FIELD_SUFFIX_REGEX = /\.text$/

export type RichTextEditorFieldProps = {
  label?: string
  /** Form path to the step's `text` field, e.g. `steps.0.text`. */
  name: string
  required?: boolean
  placeholder?: string
  formItemClassName?: string
  channels?: ChannelType[]
  includeCouponVariables?: boolean
  description?: string
}

/**
 * `sendText`-specific rich text field: writes to both `${name}` (the
 * canonical string) and its sibling `${name-with-"version"}` field on every
 * change, since `sendTextStepSchema.version` is what tells every channel
 * converter whether `text` is markup or legacy plain text (see
 * docs/rich-text-design.md). Mirrors `TiptapEditorField`'s shape otherwise.
 */
export const RichTextEditorField = ({
  name,
  description,
  label,
  required = false,
  formItemClassName,
  placeholder,
  channels,
  includeCouponVariables = false,
}: RichTextEditorFieldProps) => {
  const { control, getValues, setValue } = useFormContext()
  const versionName = name.replace(TEXT_FIELD_SUFFIX_REGEX, ".version")

  const [initValue, setInitValue] = useState<string | undefined>(undefined)
  const [initVersion, setInitVersion] = useState<
    SendTextStepVersionSchema | undefined
  >(undefined)

  useEffect(() => {
    setInitValue(getValues(name))
    setInitVersion(getValues(versionName))
  }, [getValues, name, versionName])

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("w-full", formItemClassName)}>
          {label ? (
            <FormLabel className="flex gap-1">
              {label}
              {!required && (
                <span className="self-start font-normal text-xxs">
                  (optional)
                </span>
              )}
            </FormLabel>
          ) : null}
          <FormControl>
            <RichTextTiptapEditor
              channels={channels}
              includeCouponVariables={includeCouponVariables}
              initValue={initValue}
              onChange={({ text, version }) => {
                field.onChange(text)
                setValue(versionName, version, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }}
              placeholder={placeholder}
              version={initVersion}
            />
          </FormControl>
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
