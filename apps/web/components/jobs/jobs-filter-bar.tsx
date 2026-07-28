"use client";

import { Button } from "@/components/ui/button";
import { DebouncedInput } from "@/components/ui/debounced-input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
} from "@/components/ui/input-group";
import type { JobSortBy } from "@/lib/jobs-filter";
import type { JobStatus } from "@/lib/trpc";
import { RiCloseLine, RiSearchLine } from "@remixicon/react";
import { WORK_TYPES, type WorkType, toTitleCase } from "@repo/shared";

export const ALL_STATUSES: JobStatus[] = [
  "pending_review",
  "applying",
  "applied",
  "rejected",
  "failed",
  "skipped",
];

const SORT_OPTIONS: { value: JobSortBy; label: string }[] = [
  { value: "score-desc", label: "Score (high to low)" },
  { value: "score-asc", label: "Score (low to high)" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

function toggleValue<Value extends string>(
  allValues: Value[],
  selected: Value[],
  value: Value,
  checked: boolean
): Value[] {
  const current = selected.length === 0 ? allValues : selected;
  return checked ? [...current, value] : current.filter((existing) => existing !== value);
}

export function JobsFilterBar({
  statusFilter,
  onStatusFilterChange,
  workplaceFilter,
  onWorkplaceFilterChange,
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
}: {
  statusFilter: JobStatus[];
  onStatusFilterChange: (statuses: JobStatus[]) => void;
  workplaceFilter: WorkType[];
  onWorkplaceFilterChange: (workplaceTypes: WorkType[]) => void;
  search: string;
  onSearchChange: (search: string) => void;
  sortBy: JobSortBy;
  onSortByChange: (sortBy: JobSortBy) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>
              <RiSearchLine />
            </InputGroupText>
          </InputGroupAddon>
          <DebouncedInput
            placeholder="Search..."
            value={search}
            onChange={(value) => onSearchChange(String(value))}
          />
          {search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => onSearchChange("")}
              >
                <RiCloseLine />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>
      <div className="flex items-center gap-2 border-b p-3">
        <DropdownMenu>
          <Button render={<DropdownMenuTrigger />} variant="outline" size="sm">
            Status{" "}
            {statusFilter.length === 0 || statusFilter.length === ALL_STATUSES.length
              ? "All"
              : statusFilter.length}
          </Button>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {ALL_STATUSES.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilter.length === 0 || statusFilter.includes(status)}
                  onCheckedChange={(checked) =>
                    onStatusFilterChange(toggleValue(ALL_STATUSES, statusFilter, status, checked))
                  }
                >
                  {toTitleCase(status)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Button render={<DropdownMenuTrigger />} variant="outline" size="sm">
            Workplace{" "}
            {workplaceFilter.length === 0 || workplaceFilter.length === WORK_TYPES.length
              ? "All"
              : workplaceFilter.length}
          </Button>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workplace</DropdownMenuLabel>
              {WORK_TYPES.map((workplaceType) => (
                <DropdownMenuCheckboxItem
                  key={workplaceType}
                  checked={workplaceFilter.length === 0 || workplaceFilter.includes(workplaceType)}
                  onCheckedChange={(checked) =>
                    onWorkplaceFilterChange(
                      toggleValue([...WORK_TYPES], workplaceFilter, workplaceType, checked)
                    )
                  }
                >
                  {toTitleCase(workplaceType)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Button render={<DropdownMenuTrigger />} variant="outline" size="sm">
            Sort: {SORT_OPTIONS.find((option) => option.value === sortBy)?.label}
          </Button>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sortBy}
                onValueChange={(value) => {
                  const option = SORT_OPTIONS.find((sortOption) => sortOption.value === value);
                  if (option) onSortByChange(option.value);
                }}
              >
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
