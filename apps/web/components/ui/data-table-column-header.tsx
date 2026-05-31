"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { RiArrowDownLine, RiArrowUpDownLine, RiArrowUpLine, RiEyeOffLine } from "@remixicon/react";
import { toTitleCase } from "@repo/shared";
import type { Column } from "@tanstack/react-table";

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort() && !column.getCanHide() && !column.getCanFilter()) {
    return <div className={cn("ml-3", className)}>{title}</div>;
  }

  const sortedUniqueValues = Array.from(column.getFacetedUniqueValues().keys()).filter(
    (value) => value !== undefined
  );
  const filterValue = column.getFilterValue();

  function handleFilterChange(checked: boolean, key: string) {
    if (filterValue === undefined) {
      if (checked) {
        column.setFilterValue([key]);
      } else {
        column.setFilterValue(sortedUniqueValues.filter((value) => value !== key));
      }
    } else {
      if (Array.isArray(filterValue)) {
        if (checked) {
          column.setFilterValue([...filterValue, key]);
        } else {
          column.setFilterValue(filterValue.filter((value) => value !== key));
        }
      }
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu>
        <Button
          render={<DropdownMenuTrigger />}
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 data-[state=open]:bg-accent"
        >
          <span>{title}</span>
          {column.getCanSort() &&
            (column.getIsSorted() === "desc" ? (
              <RiArrowDownLine />
            ) : column.getIsSorted() === "asc" ? (
              <RiArrowUpLine />
            ) : (
              <RiArrowUpDownLine />
            ))}
        </Button>
        <DropdownMenuContent align="start">
          {column.getCanSort() && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Sort</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  if (column.getIsSorted() === "asc") {
                    column.clearSorting();
                  } else {
                    column.toggleSorting(false, true);
                  }
                }}
                className={cn(column.getIsSorted() === "asc" && "bg-muted")}
              >
                <RiArrowUpLine />
                Asc
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (column.getIsSorted() === "desc") {
                    column.clearSorting();
                  } else {
                    column.toggleSorting(true, true);
                  }
                }}
                className={cn(column.getIsSorted() === "desc" && "bg-muted")}
              >
                <RiArrowDownLine />
                Desc
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}

          {column.getCanSort() && (column.getCanFilter() || column.getCanHide()) && (
            <DropdownMenuSeparator />
          )}

          {column.getCanFilter() && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter</DropdownMenuLabel>
              {sortedUniqueValues.map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={
                    filterValue === undefined
                      ? true
                      : Array.isArray(filterValue) && filterValue.includes(key)
                  }
                  onCheckedChange={(checked) => handleFilterChange(checked, key)}
                >
                  {toTitleCase(String(key))}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          )}

          {column.getCanFilter() && column.getCanHide() && <DropdownMenuSeparator />}

          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <RiEyeOffLine />
            Hide
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
