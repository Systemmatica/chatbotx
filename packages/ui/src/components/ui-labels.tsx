"use client"

import { createContext, type ReactNode, useContext } from "react"

/**
 * Default user-visible labels for shared UI components (data table, combobox,
 * multi-select, dialogs). Apps mount `UiLabelsProvider` once with translated
 * values; components resolve labels as: explicit prop -> context -> English
 * fallback.
 */
export type UiLabels = {
  // Data table
  noResults?: string
  selectedRows?: (selected: number, total: number) => string
  rowsPerPage?: string
  pageOf?: (page: number, pageCount: number) => string
  firstPage?: string
  previousPage?: string
  nextPage?: string
  lastPage?: string
  sortAsc?: string
  sortDesc?: string
  reset?: string
  resetFilters?: string
  hide?: string
  view?: string
  toggleColumns?: string
  searchColumns?: string
  noColumnsFound?: string
  clearFilters?: string
  // Generic
  clear?: string
  close?: string
  search?: string
  pleaseSelect?: string
  noRecordFound?: string
  selectOption?: string
  // Multi-select
  selectOptions?: string
  searchOptions?: string
  noResultsFound?: string
  selectAll?: string
  optionsCount?: (count: number) => string
  moreCount?: (count: number) => string
  clearAllSelected?: (count: number) => string
}

const UiLabelsContext = createContext<UiLabels>({})

export function UiLabelsProvider({
  labels,
  children,
}: {
  labels: UiLabels
  children: ReactNode
}) {
  return (
    <UiLabelsContext.Provider value={labels}>
      {children}
    </UiLabelsContext.Provider>
  )
}

export function useUiLabels(): UiLabels {
  return useContext(UiLabelsContext)
}
