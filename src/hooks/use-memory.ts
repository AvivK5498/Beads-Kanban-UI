"use client";

/**
 * Hook for loading and managing memory entries (knowledge base).
 *
 * Fetches from GET /api/memory and provides search, filter,
 * edit, archive, and delete capabilities.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { MemoryEntry, MemoryStats, MemoryType } from "@/types";
import * as api from "@/lib/api";

export interface UseMemoryResult {
  /** All memory entries from the project */
  entries: MemoryEntry[];
  /** Aggregate stats */
  stats: MemoryStats | null;
  /** Whether entries are currently being loaded */
  isLoading: boolean;
  /** Any error that occurred during loading */
  error: Error | null;
  /** Current search query */
  search: string;
  /** Set search query */
  setSearch: (value: string) => void;
  /** Current type filter (null = all) */
  typeFilter: MemoryType | null;
  /** Set type filter */
  setTypeFilter: (value: MemoryType | null) => void;
  /** Entries filtered by search and type */
  filteredEntries: MemoryEntry[];
  /** Edit an entry's content and/or tags */
  editEntry: (key: string, content?: string, tags?: string[]) => Promise<void>;
  /** Archive an entry (move to archive file) */
  archiveEntry: (key: string) => Promise<void>;
  /** Permanently delete an entry */
  deleteEntry: (key: string) => Promise<void>;
  /** Manually refresh entries */
  refresh: () => Promise<void>;
}

const EMPTY_STATS: MemoryStats = {
  total: 0,
  learned: 0,
  investigation: 0,
  archived: 0,
};

/**
 * Hook to load and manage memory entries from a project's knowledge base.
 *
 * @param projectPath - The absolute path to the project root
 * @returns Object containing entries, stats, filters, mutations, and refresh
 */
export function useMemory(projectPath: string): UseMemoryResult {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | null>(null);

  // Track if initial load has completed
  const hasLoadedRef = useRef(false);

  /**
   * Load memory entries from the API
   */
  const loadMemory = useCallback(async () => {
    if (!projectPath) {
      setEntries([]);
      setStats(EMPTY_STATS);
      setIsLoading(false);
      return;
    }

    // Only show loading on initial load
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }

    try {
      const response = await api.memory.list(projectPath);
      setEntries(response.entries);
      setStats(response.stats);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("Failed to load memory:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  /**
   * Public refresh function
   */
  const refresh = useCallback(async () => {
    await loadMemory();
  }, [loadMemory]);

  // Initial load when project path changes
  useEffect(() => {
    hasLoadedRef.current = false;
    loadMemory();
  }, [loadMemory]);

  /**
   * Filter entries by search query and type
   */
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Apply type filter
    if (typeFilter) {
      result = result.filter((e) => e.type === typeFilter);
    }

    // Apply search filter
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.content.toLowerCase().includes(query) ||
          e.key.toLowerCase().includes(query) ||
          e.tags.some((t) => t.toLowerCase().includes(query)) ||
          e.bead.toLowerCase().includes(query)
      );
    }

    return result;
  }, [entries, search, typeFilter]);

  /**
   * Edit an entry's content and/or tags
   */
  const editEntry = useCallback(
    async (key: string, content?: string, tags?: string[]) => {
      if (!projectPath) return;
      try {
        await api.memory.update(projectPath, key, content, tags);
        await loadMemory();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("Failed to edit memory entry:", error);
        throw error;
      }
    },
    [projectPath, loadMemory]
  );

  /**
   * Archive an entry
   */
  const archiveEntry = useCallback(
    async (key: string) => {
      if (!projectPath) return;
      try {
        await api.memory.remove(projectPath, key, true);
        await loadMemory();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("Failed to archive memory entry:", error);
        throw error;
      }
    },
    [projectPath, loadMemory]
  );

  /**
   * Permanently delete an entry
   */
  const deleteEntry = useCallback(
    async (key: string) => {
      if (!projectPath) return;
      try {
        await api.memory.remove(projectPath, key, false);
        await loadMemory();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("Failed to delete memory entry:", error);
        throw error;
      }
    },
    [projectPath, loadMemory]
  );

  return {
    entries,
    stats,
    isLoading,
    error,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    filteredEntries,
    editEntry,
    archiveEntry,
    deleteEntry,
    refresh,
  };
}
