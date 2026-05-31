"use client";

import type { Table } from "@tanstack/react-table";

import { RiCloseLine, RiSearchLine } from "@remixicon/react";
import { DataTableViewOptions } from "./data-table-view-options";
import { DebouncedInput } from "./debounced-input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText } from "./input-group";

export function DataTableToolbar<TData>({ table }: { table: Table<TData> }) {
  const isFiltered = table.getState().globalFilter?.length > 0;

  return (
    <div className="flex items-center gap-2 py-4">
      <InputGroup className="w-full lg:w-62.5">
        <InputGroupAddon>
          <InputGroupText>
            <RiSearchLine />
          </InputGroupText>
        </InputGroupAddon>
        <DebouncedInput
          placeholder="Search..."
          value={table.getState().globalFilter ?? ""}
          onChange={(value) => table.setGlobalFilter(value)}
        />
        {isFiltered && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={() => table.resetGlobalFilter()}>
              <RiCloseLine />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      <DataTableViewOptions table={table} />
    </div>
  );
}
