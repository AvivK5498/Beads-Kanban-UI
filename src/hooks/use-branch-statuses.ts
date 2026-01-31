/**
 * Hook for fetching branch statuses for multiple beads
 *
 * Efficiently fetches branch status (exists, ahead, behind) for all beads
 * in a project and keeps the data updated.
 *
 * @deprecated Use `useWorktreeStatuses` instead. This hook will be removed in a future version.
 * The worktree-based workflow is now the primary approach for managing bead development environments.
 */

import { useState, useEffect, useCallback, useRef } from "react";

import { getBatchBranchStatus, type BranchStatus } from "@/lib/git";

/**
 * Result type for the useBranchStatuses hook
 */
export interface UseBranchStatusesResult {
  /** Map of bead ID to branch status */
  statuses: Record<string, BranchStatus>;
  /** Whether statuses are currently being loaded */
  isLoading: boolean;
  /** Any error that occurred during loading */
  error: Error | null;
  /** Manually refresh branch statuses */
  refresh: () => Promise<void>;
}

/**
 * Convert bead ID to expected branch name format
 *
 * @param beadId - The bead ID (e.g., "BD-001" or "project-abc123")
 * @returns The expected branch name (e.g., "bd-BD-001")
 */
function beadIdToBranchName(beadId: string): string {
  // If already has bd- prefix, use as-is (lowercase)
  if (beadId.toLowerCase().startsWith("bd-")) {
    return `bd-${beadId}`;
  }
  // Otherwise prefix with bd-
  return `bd-${beadId}`;
}

// Track if deprecation warning has been logged globally (once per app session)
let hasLoggedDeprecationWarning = false;

/**
 * Hook to fetch and track branch statuses for beads
 *
 * @deprecated Use `useWorktreeStatuses` instead. This hook will be removed in a future version.
 *
 * @param projectPath - Absolute path to the project git repository
 * @param beadIds - Array of bead IDs to check branch status for
 * @returns Object containing statuses map, loading state, error, and refresh function
 *
 * @example
 * ```tsx
 * function KanbanBoard({ projectPath, beads }) {
 *   const beadIds = beads.map(b => b.id);
 *   const { statuses, isLoading } = useBranchStatuses(projectPath, beadIds);
 *
 *   return beads.map(bead => (
 *     <BeadCard
 *       key={bead.id}
 *       bead={bead}
 *       branchStatus={statuses[bead.id]}
 *     />
 *   ));
 * }
 * ```
 */
export function useBranchStatuses(
  projectPath: string,
  beadIds: string[]
): UseBranchStatusesResult {
  const [statuses, setStatuses] = useState<Record<string, BranchStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Log deprecation warning once per app session
  useEffect(() => {
    if (!hasLoggedDeprecationWarning) {
      console.warn(
        "[DEPRECATED] useBranchStatuses is deprecated. Use useWorktreeStatuses instead. " +
        "The worktree-based workflow is now the primary approach for managing bead development environments."
      );
      hasLoggedDeprecationWarning = true;
    }
  }, []);

  // Track if initial load has completed
  const hasLoadedRef = useRef(false);

  // Store previous bead IDs to detect changes
  const prevBeadIdsRef = useRef<string[]>([]);

  /**
   * Load branch statuses for all beads
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
      // Convert bead IDs to branch names
      const branchNames = beadIds.map(beadIdToBranchName);

      // Fetch all branch statuses in batch
      const branchStatuses = await getBatchBranchStatus(projectPath, branchNames);

      // Map back to bead IDs
      const beadStatuses: Record<string, BranchStatus> = {};
      beadIds.forEach((beadId) => {
        const branchName = beadIdToBranchName(beadId);
        beadStatuses[beadId] = branchStatuses[branchName] || {
          exists: false,
          ahead: 0,
          behind: 0,
        };
      });

      setStatuses(beadStatuses);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("Failed to load branch statuses:", error);
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

  // Set up periodic refresh (every 30 seconds)
  useEffect(() => {
    if (!projectPath || beadIds.length === 0) return;

    const intervalId = setInterval(() => {
      loadStatuses();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [projectPath, beadIds.length, loadStatuses]);

  return {
    statuses,
    isLoading,
    error,
    refresh,
  };
}
