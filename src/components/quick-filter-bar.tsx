'use client';

import * as React from 'react';
import { Search, X, ArrowUpDown, SlidersHorizontal, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { BeadStatus } from '@/types';

type TypeFilter = 'all' | 'epics' | 'tasks';
type SortField = 'ticket_number' | 'created_at';
type SortDirection = 'asc' | 'desc';

interface QuickFilterBarProps {
  /** Issue type filter: all, epics, or tasks */
  typeFilter: TypeFilter;
  /** Callback when type filter changes */
  onTypeFilterChange: (type: TypeFilter) => void;
  /** Whether to show only today's active items */
  todayOnly: boolean;
  /** Callback when today's active toggle changes */
  onTodayOnlyChange: (value: boolean) => void;
  /** Field to sort by */
  sortField: SortField;
  /** Sort direction */
  sortDirection: SortDirection;
  /** Callback when sort changes */
  onSortChange: (field: SortField, direction: SortDirection) => void;
  /** Search query */
  search: string;
  /** Callback when search changes */
  onSearchChange: (value: string) => void;
  /** Ref for the search input (keyboard navigation) */
  searchInputRef?: React.RefObject<HTMLInputElement>;
  /** Active status filters */
  statuses: BeadStatus[];
  /** Callback when status filter toggles */
  onStatusToggle: (status: BeadStatus) => void;
  /** Active owner filters */
  owners: string[];
  /** Callback when owner filter toggles */
  onOwnerToggle: (owner: string) => void;
  /** List of available owners */
  availableOwners: string[];
  /** Callback to clear all filters */
  onClearFilters: () => void;
  /** Whether any filters are active */
  hasActiveFilters: boolean;
  /** Whether the memory panel is open */
  isMemoryOpen?: boolean;
  /** Callback to toggle memory panel */
  onMemoryToggle?: () => void;
}

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'epics', label: 'Epics' },
  { value: 'tasks', label: 'Tasks' },
];

const SORT_OPTIONS: { value: string; label: string; field: SortField; direction: SortDirection }[] = [
  { value: 'ticket_number_desc', label: 'Ticket # (Newest)', field: 'ticket_number', direction: 'desc' },
  { value: 'ticket_number_asc', label: 'Ticket # (Oldest)', field: 'ticket_number', direction: 'asc' },
  { value: 'created_at_desc', label: 'Updated (Newest)', field: 'created_at', direction: 'desc' },
  { value: 'created_at_asc', label: 'Updated (Oldest)', field: 'created_at', direction: 'asc' },
];

const STATUS_OPTIONS: { value: BeadStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'inreview', label: 'In Review' },
  { value: 'closed', label: 'Closed' },
];

/**
 * QuickFilterBar provides quick access to common filter and sort operations
 * for the kanban board. Displays below the header as a horizontal bar.
 */
export function QuickFilterBar({
  typeFilter,
  onTypeFilterChange,
  todayOnly,
  onTodayOnlyChange,
  sortField,
  sortDirection,
  onSortChange,
  search,
  onSearchChange,
  searchInputRef,
  statuses,
  onStatusToggle,
  owners,
  onOwnerToggle,
  availableOwners,
  onClearFilters,
  hasActiveFilters,
  isMemoryOpen,
  onMemoryToggle,
}: QuickFilterBarProps) {
  const currentSortValue = `${sortField}_${sortDirection}`;

  const handleSortOptionSelect = (value: string) => {
    const option = SORT_OPTIONS.find((opt) => opt.value === value);
    if (option) {
      onSortChange(option.field, option.direction);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Quick filters"
      className="flex items-center gap-3 rounded-xl bg-zinc-900/80 backdrop-blur border border-zinc-800 px-3 py-2"
    >
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" aria-hidden="true" />
        <Input
          ref={searchInputRef}
          type="text"
          aria-label="Search beads"
          placeholder="Search… (/)"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 pr-8 w-[180px] h-8 bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-0 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center text-zinc-500 hover:text-zinc-300"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Type Filter & Today - Unified Tabs */}
      <Tabs
        value={typeFilter}
        onValueChange={(value) => onTypeFilterChange(value as TypeFilter)}
        className="h-8"
      >
        <TabsList className="h-8 bg-zinc-800/50 p-0.5">
          {TYPE_OPTIONS.map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
              className="h-7 px-3 text-sm font-medium data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-zinc-200"
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Today's Active Toggle - styled to match tabs */}
      <button
        type="button"
        onClick={() => onTodayOnlyChange(!todayOnly)}
        aria-pressed={todayOnly}
        className={cn(
          'h-8 px-3 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
          todayOnly
            ? 'bg-purple-500/20 text-purple-400'
            : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'
        )}
      >
        Today
      </button>

      {/* Memory Toggle */}
      {onMemoryToggle && (
        <button
          type="button"
          onClick={onMemoryToggle}
          aria-pressed={isMemoryOpen}
          className={cn(
            'h-8 px-3 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
            isMemoryOpen
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'
          )}
        >
          <BrainCircuit className="size-4" aria-hidden="true" />
          Memory
        </button>
      )}

      {/* Spacer to push sort and filter to the right */}
      <div className="flex-1" />

      {/* Sort Icon Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-zinc-400 hover:text-zinc-100"
            aria-label="Sort options"
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
          <DropdownMenuLabel className="text-zinc-400">Sort by</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={currentSortValue === option.value}
              onCheckedChange={() => handleSortOptionSelect(option.value)}
              className="text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100"
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filter Icon Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-2',
              hasActiveFilters ? 'text-purple-400' : 'text-zinc-400 hover:text-zinc-100'
            )}
            aria-label="Filter options"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {hasActiveFilters && <span className="ml-1 text-xs" aria-hidden="true">•</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800">
          <DropdownMenuLabel className="text-zinc-400">Status</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={statuses.includes(option.value)}
              onCheckedChange={() => onStatusToggle(option.value)}
              className="text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100"
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}

          {availableOwners.length > 0 && (
            <>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuLabel className="text-zinc-400">Owner</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />
              {availableOwners.map((owner) => (
                <DropdownMenuCheckboxItem
                  key={owner}
                  checked={owners.includes(owner)}
                  onCheckedChange={() => onOwnerToggle(owner)}
                  className="text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100"
                >
                  {owner}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}

          {hasActiveFilters && (
            <>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onClick={onClearFilters}
                className="text-red-400 focus:bg-zinc-800 focus:text-red-400"
              >
                Clear filters
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export type { QuickFilterBarProps, TypeFilter, SortField, SortDirection };
