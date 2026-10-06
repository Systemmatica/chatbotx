"use client"

import {
  type UiLabels,
  UiLabelsProvider,
} from "@chatbotx.io/ui/components/ui-labels"
import { useTranslations } from "next-intl"
import { type ReactNode, useMemo } from "react"

/**
 * Feeds translated default labels into shared `@chatbotx.io/ui` components
 * (data table pagination, combobox, multi-select, dialog close buttons) so
 * call sites don't have to pass them one by one.
 */
export function UiLabelsBridge({ children }: { children: ReactNode }) {
  const t = useTranslations()

  const labels = useMemo<UiLabels>(
    () => ({
      noResults: t("analytics.noResults"),
      selectedRows: (selected, total) =>
        t("analytics.pagination.selectedRows", { selected, total }),
      rowsPerPage: t("analytics.pagination.rowsPerPage"),
      pageOf: (page, pageCount) =>
        t("analytics.pagination.pageOf", { page, pageCount }),
      firstPage: t("analytics.pagination.firstPage"),
      previousPage: t("analytics.pagination.previousPage"),
      nextPage: t("analytics.pagination.nextPage"),
      lastPage: t("analytics.pagination.lastPage"),
      sortAsc: t("uiLabels.sortAsc"),
      sortDesc: t("uiLabels.sortDesc"),
      reset: t("actions.reset"),
      resetFilters: t("uiLabels.resetFilters"),
      hide: t("uiLabels.hide"),
      view: t("uiLabels.view"),
      toggleColumns: t("uiLabels.toggleColumns"),
      searchColumns: t("uiLabels.searchColumns"),
      noColumnsFound: t("uiLabels.noColumnsFound"),
      clearFilters: t("uiLabels.clearFilters"),
      clear: t("actions.clear"),
      close: t("uiLabels.close"),
      search: t("fields.search.placeholder"),
      pleaseSelect: t("actions.pleaseSelect"),
      noRecordFound: t("actions.noRecordFound"),
      selectOption: t("uiLabels.selectOption"),
      selectOptions: t("uiLabels.selectOptions"),
      searchOptions: t("uiLabels.searchOptions"),
      noResultsFound: t("fields.noResults.label"),
      selectAll: t("actions.selectAll"),
      optionsCount: (count) => t("uiLabels.optionsCount", { count }),
      moreCount: (count) => t("uiLabels.moreCount", { count }),
      clearAllSelected: (count) => t("uiLabels.clearAllSelected", { count }),
    }),
    [t],
  )

  return <UiLabelsProvider labels={labels}>{children}</UiLabelsProvider>
}
