import {
  flexRender,
  type Row,
  type Table as TanstackTable,
} from "@tanstack/react-table"
import type * as React from "react"

import { DataTablePagination } from "@chatbotx.io/ui/components/data-table/data-table-pagination"
import type { DataTablePaginationLabels } from "@chatbotx.io/ui/components/data-table/data-table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useUiLabels } from "@chatbotx.io/ui/components/ui-labels"
import { getCommonPinningStyles } from "@chatbotx.io/ui/lib/data-table"
import { cn } from "@chatbotx.io/ui/lib/utils"

interface DataTableProps<TData> extends React.ComponentProps<"div"> {
  table: TanstackTable<TData>
  actionBar?: React.ReactNode
  labels?: DataTablePaginationLabels & {
    noResults?: string
  }
  scrollable?: boolean
  /**
   * Called on a click anywhere in a row (e.g. open a side peek). Rows get a
   * pointer cursor; the handler decides which inner targets to ignore.
   */
  onRowClick?: (row: Row<TData>, event: React.MouseEvent<HTMLElement>) => void
  /** Highlights a row (e.g. the one open in a side peek). */
  isRowActive?: (row: Row<TData>) => boolean
}

export function DataTable<TData>({
  table,
  actionBar,
  labels,
  scrollable = false,
  onRowClick,
  isRowActive,
  children,
  className,
  ...props
}: DataTableProps<TData>) {
  const contextLabels = useUiLabels()
  return (
    <div
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      {children}
      <div
        className={cn(
          "rounded-md border",
          scrollable ? "overflow-x-auto" : "overflow-hidden",
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      ...getCommonPinningStyles({ column: header.column }),
                      width:
                        header.column.columnDef.size === undefined
                          ? undefined
                          : header.getSize(),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  data-active={isRowActive?.(row) ? "true" : undefined}
                  className={cn(
                    onRowClick && "cursor-pointer",
                    "data-[active=true]:bg-muted",
                  )}
                  onClick={onRowClick ? (event) => onRowClick(row, event) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getCommonPinningStyles({ column: cell.column }),
                        width:
                          cell.column.columnDef.size === undefined
                            ? undefined
                            : cell.column.getSize(),
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center"
                >
                  {labels?.noResults ?? contextLabels.noResults ?? "No results."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        <DataTablePagination labels={labels} table={table} />
        {actionBar &&
          table.getFilteredSelectedRowModel().rows.length > 0 &&
          actionBar}
      </div>
    </div>
  )
}
