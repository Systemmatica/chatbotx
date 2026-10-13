"use client"

import { parseAsString, useQueryState } from "nuqs"
import { useCallback } from "react"
import { CONTACT_PEEK_PARAM } from "../lib/peek-navigation"

/**
 * The contact open in the side peek, kept in the URL (`?contact=<id>`) so the
 * peek survives a reload and can be shared. Opening/closing replaces the
 * history entry: Back leaves the page instead of stepping through contacts.
 */
export function useContactPeek() {
  const [contactId, setContactId] = useQueryState(
    CONTACT_PEEK_PARAM,
    parseAsString.withOptions({ history: "replace", scroll: false }),
  )

  const openContact = useCallback(
    (id: string) => {
      setContactId(id)
    },
    [setContactId],
  )

  const closeContact = useCallback(() => {
    setContactId(null)
  }, [setContactId])

  return { contactId, openContact, closeContact }
}
