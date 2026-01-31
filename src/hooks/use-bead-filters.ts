"use client";

/**
 * Hook for filtering beads with debounced search and multi-criteria filtering.
 *
 * Provides search (with 300ms debounce), status, priority, and owner filtering
 * with a clean API for the kanban board.
 */

import { useState, useMemo, useCallback, useEffect } from "react";

import type { Bead, BeadStatus } from "@/types";

/**
 * Sort field options
 */
export type SortField = "ticket_number" | "created_at";

/**
 * Sort direction options
 */
export type SortDirection = "asc" | "desc";

/**
 * Filter state for beads
 */
export interface BeadFilters {
  /** Search query for title and description (case-insensitive) */
  search: string;
  /** Status filter - empty array means all statuses */
  statuses: BeadStatus[];
  /** Priority filter - empty array means all priorities (0-4) */
  priorities: number[];
  /** Owner/agent filter - empty array means all owners */
  owners: string[];
  /** Sort field */
  sortField: SortField;
  /** Sort direction */
  sortDirection: SortDirection;
  /** Filter to items updated (worked on) today */
  todayOnly: boolean;
}

/**
 * Result type for the useBeadFilters hook
 */
export interface UseBeadFiltersResult {
  /** Current filter state */
  filters: BeadFilters;
  /** Update filters (partial update supported) */
  setFilters: (filters: Partial<BeadFilters>) => void;
  /** Beads after applying all filters */
  filteredBeads: Bead[];
  /** Reset all filters to default */
  clearFilters: () => void;
  /** Whether any filters are active */
  hasActiveFilters: boolean;
  /** Count of active filter categories */
  activeFilterCount: number;
  /** Unique owners extracted from beads */
  availableOwners: string[];
  /** Debounced search value (for display) */
  debouncedSearch: string;
}

/**
 * Default/empty filter state
 */
const DEFAULT_FILTERS: BeadFilters = {
  search: "",
  statuses: [],
  priorities: [],
  owners: [],
  sortField: "created_at",
  sortDirection: "desc",
  todayOnly: false,
};

/**
 * Hook to filter beads with debounced search and multi-criteria filtering.
 *
 * @param beads - Array of beads to filter
 * @param debounceMs - Debounce delay for search input (default 300ms)
 * @returns Filter state, setters, and filtered beads
 *
 * @example
 * ```tsx
 * function KanbanBoard({ beads }: { beads: Bead[] }) {
 *   const {
 *     filters,
 *     setFilters,
 *     filteredBeads,
 *     clearFilters,
 *     hasActiveFilters,
 *     activeFilterCount,
 *   } = useBeadFilters(beads);
 *
 *   return (
 *     <>
 *       <input
 *         value={filters.search}
 *         onChange={(e) => setFilters({ search: e.target.value })}
 *       />
 *       {hasActiveFilters && (
 *         <button onClick={clearFilters}>
 *           Clear ({activeFilterCount})
 *         </button>
 *       )}
 *       <BeadList beads={filteredBeads} />
 *     </>
 *   );
 * }
 * ```
 */
export function useBeadFilters(
  beads: Bead[],
  ticketNumbers: Map<string, number>,
  debounceMs: number = 300
): UseBeadFiltersResult {
  // Filter state
  const [filters, setFiltersState] = useState<BeadFilters>(DEFAULT_FILTERS);

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [filters.search, debounceMs]);

  /**
   * Update filters with partial state
   */
  const setFilters = useCallback((partialFilters: Partial<BeadFilters>) => {
    setFiltersState((prev) => ({
      ...prev,
      ...partialFilters,
    }));
  }, []);

  /**
   * Reset all filters to defaults
   */
  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setDebouncedSearch("");
  }, []);

  /**
   * Extract unique owners from all beads
   */
  const availableOwners = useMemo(() => {
    const owners = new Set<string>();
    beads.forEach((bead) => {
      if (bead.owner) {
        owners.add(bead.owner);
      }
    });
    return Array.from(owners).sort();
  }, [beads]);

  /**
   * Apply all filters to beads and sort
   */
  const filteredBeads = useMemo(() => {
    const { sortField, sortDirection } = filters;

    // Filter beads
    const filtered = beads.filter((bead) => {
      // Search filter (uses debounced value for performance)
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        const matchesSearch =
          bead.title.toLowerCase().includes(searchLower) ||
          (bead.description &&
            bead.description.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.statuses.length > 0) {
        if (!filters.statuses.includes(bead.status)) return false;
      }

      // Priority filter
      if (filters.priorities.length > 0) {
        if (!filters.priorities.includes(bead.priority)) return false;
      }

      // Owner filter
      if (filters.owners.length > 0) {
        if (!filters.owners.includes(bead.owner)) return false;
      }

      // Today filter - items updated (worked on) today, regardless of status
      if (filters.todayOnly) {
        const today = new Date().toISOString().split("T")[0];
        const updatedToday = bead.updated_at.startsWith(today);
        if (!updatedToday) return false;
      }

      return true;
    });

    // Sort the filtered results (use toSorted for immutability)
    const sorted = filtered.toSorted((a, b) => {
      if (sortField === "ticket_number") {
        const aNum = ticketNumbers.get(a.id) ?? 0;
        const bNum = ticketNumbers.get(b.id) ?? 0;
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
      // created_at sort
      const aDate = new Date(a.created_at).getTime();
      const bDate = new Date(b.created_at).getTime();
      return sortDirection === "asc" ? aDate - bDate : bDate - aDate;
    });

    return sorted;
  }, [beads, debouncedSearch, filters, ticketNumbers]);

  /**
   * Check if any filters are active
   */
  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== "" ||
      filters.statuses.length > 0 ||
      filters.priorities.length > 0 ||
      filters.owners.length > 0 ||
      filters.todayOnly ||
      filters.sortField !== DEFAULT_FILTERS.sortField ||
      filters.sortDirection !== DEFAULT_FILTERS.sortDirection
    );
  }, [filters]);

  /**
   * Count active filter categories (for badge)
   */
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.statuses.length > 0) count++;
    if (filters.priorities.length > 0) count++;
    if (filters.owners.length > 0) count++;
    if (filters.todayOnly) count++;
    return count;
  }, [filters]);

  return {
    filters,
    setFilters,
    filteredBeads,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
    availableOwners,
    debouncedSearch,
  };
}
