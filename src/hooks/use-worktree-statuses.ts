/**
 * Hook for fetching worktree statuses for multiple beads
 *
 * Efficiently fetches worktree status (exists, path, ahead, behind, dirty)
 * for all beads in a project and keeps the data updated via polling.
 */

import { useState, useEffect, useCallback, useRef } from "react";

import * as api from "@/lib/api";
import type { WorktreeStatus } from "@/types";

/** Default polling interval in milliseconds */
const DEFAULT_POLLING_INTERVAL = 30_000;

/**
 * Result type for the useWorktreeStatuses hook
 */
export interface UseWorktreeStatusesResult {
  /** Map of bead ID to worktree status */
  statuses: Record<string, WorktreeStatus>;
  /** Whether statuses are currently being loaded */
  isLoading: boolean;
  /** Any error that occurred during loading */
  error: Error | null;
  /** Manually refresh worktree statuses */
  refresh: () => Promise<void>;
}

/**
 * Default worktree status for beads without a worktree
 */
const DEFAULT_STATUS: WorktreeStatus = {
  exists: false,
  worktree_path: null,
  branch: null,
  ahead: 0,
  behind: 0,
  dirty: false,
  last_modified: null,
};

/**
 * Hook to fetch and track worktree statuses for beads
 *
 * @param projectPath - Absolute path to the project git repository
 * @param beadIds - Array of bead IDs to check worktree status for
 * @param pollingInterval - Polling interval in milliseconds (default: 30000)
 * @returns Object containing statuses map, loading state, error, and refresh function
 *
 * @example
 * ```tsx
 * function KanbanBoard({ projectPath, beads }) {
 *   const beadIds = beads.map(b => b.id);
 *   const { statuses, isLoading } = useWorktreeStatuses(projectPath, beadIds);
 *
 *   return beads.map(bead => (
 *     <BeadCard
 *       key={bead.id}
 *       bead={bead}
 *       worktreeStatus={statuses[bead.id]}
 *     />
 *   ));
 * }
 * ```
 */
export function useWorktreeStatuses(
  projectPath: string,
  beadIds: string[],
  pollingInterval = DEFAULT_POLLING_INTERVAL
): UseWorktreeStatusesResult {
  const [statuses, setStatuses] = useState<Record<string, WorktreeStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track if initial load has completed
  const hasLoadedRef = useRef(false);

  // Store previous bead IDs to detect changes
  const prevBeadIdsRef = useRef<string[]>([]);

  /**
   * Load worktree statuses for all beads in parallel
   */
  const loadStatuses = useCallback(async () => {
    if (!projectPath || beadIds.length === 0) {
      setStatuses({});
      setIsLoading(false);
      return;
    }

    // Only show loading on initial load
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }

    try {
      // Fetch all worktree statuses in parallel (Promise.all pattern)
      const results = await Promise.all(
        beadIds.map(async (beadId) => {
          try {
            const status = await api.git.worktreeStatus(projectPath, beadId);
            return { beadId, status };
          } catch {
            // If there's an error, return default status
            return { beadId, status: DEFAULT_STATUS };
          }
        })
      );

      // Build statuses map
      const beadStatuses: Record<string, WorktreeStatus> = {};
      for (const { beadId, status } of results) {
        beadStatuses[beadId] = status;
      }

      setStatuses(beadStatuses);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("Failed to load worktree statuses:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, beadIds]);

  /**
   * Public refresh function for manual reload
   */
  const refresh = useCallback(async () => {
    await loadStatuses();
  }, [loadStatuses]);

  // Load statuses when project path or bead IDs change
  useEffect(() => {
    // Check if bead IDs have actually changed
    const beadIdsChanged =
      beadIds.length !== prevBeadIdsRef.current.length ||
      beadIds.some((id, i) => id !== prevBeadIdsRef.current[i]);

    if (beadIdsChanged) {
      prevBeadIdsRef.current = [...beadIds];
      hasLoadedRef.current = false;
    }

    loadStatuses();
  }, [loadStatuses, beadIds]);

  // Set up periodic refresh (polling)
  useEffect(() => {
    if (!projectPath || beadIds.length === 0) return;

    const intervalId = setInterval(() => {
      loadStatuses();
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [projectPath, beadIds.length, loadStatuses, pollingInterval]);

  return {
    statuses,
    isLoading,
    error,
    refresh,
  };
}
