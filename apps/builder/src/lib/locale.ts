"use server"

import { cookies } from "next/headers"
import { defaultLocale, isLocale, type Locale } from "@/i18n/config"

// In this example the locale is read from a cookie. You could alternatively
// also read it from a database, backend service, or any other source.
const COOKIE_NAME = "NEXT_LOCALE"

// Self-hosted instances can pick the locale shown before a user chooses one
// (e.g. DEFAULT_LOCALE=ru); unset or unknown values keep `defaultLocale`.
function instanceDefaultLocale(): Locale {
  const configured = process.env.DEFAULT_LOCALE?.trim()
  return configured && isLocale(configured) ? configured : defaultLocale
}

export async function getUserLocale() {
  return (await cookies()).get(COOKIE_NAME)?.value || instanceDefaultLocale()
}

export async function setUserLocale(locale: Locale) {
  ;(await cookies()).set(COOKIE_NAME, locale)
}
