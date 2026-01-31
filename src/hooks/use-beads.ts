"use client";

/**
 * Hook for loading and managing beads with real-time file watching.
 *
 * Combines the beads parser with file watcher to provide automatic
 * updates when the issues.jsonl file changes.
 */

import { useState, useEffect, useCallback, useRef } from "react";

import { useFileWatcher } from "@/hooks/use-file-watcher";
import {
  loadProjectBeads,
  groupBeadsByStatus,
  assignTicketNumbers,
} from "@/lib/beads-parser";
import type { Bead, BeadStatus } from "@/types";

/**
 * Result type for the useBeads hook
 */
export interface UseBeadsResult {
  /** Array of all beads from the project */
  beads: Bead[];
  /** Beads grouped by status for kanban columns */
  beadsByStatus: Record<BeadStatus, Bead[]>;
  /** Map of bead ID to sequential ticket number (1-indexed by creation order) */
  ticketNumbers: Map<string, number>;
  /** Whether beads are currently being loaded */
  isLoading: boolean;
  /** Any error that occurred during loading */
  error: Error | null;
  /** Manually refresh beads from the file */
  refresh: () => Promise<void>;
}

/**
 * Empty grouped beads object for initial state
 */
const EMPTY_GROUPED: Record<BeadStatus, Bead[]> = {
  open: [],
  in_progress: [],
  inreview: [],
  closed: [],
};

/**
 * Hook to load and watch beads from a project directory.
 *
 * Automatically refreshes when the issues.jsonl file changes.
 *
 * @param projectPath - The absolute path to the project root
 * @returns Object containing beads, grouped beads, loading state, error, and refresh function
 *
 * @example
 * ```tsx
 * function KanbanBoard({ projectPath }: { projectPath: string }) {
 *   const { beadsByStatus, isLoading, error, refresh } = useBeads(projectPath);
 *
 *   if (isLoading) return <Loading />;
 *   if (error) return <Error message={error.message} />;
 *
 *   return (
 *     <div>
 *       <Column title="Open" beads={beadsByStatus.open} />
 *       <Column title="In Progress" beads={beadsByStatus.in_progress} />
 *       <Column title="In Review" beads={beadsByStatus.inreview} />
 *       <Column title="Closed" beads={beadsByStatus.closed} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useBeads(projectPath: string): UseBeadsResult {
  const [beads, setBeads] = useState<Bead[]>([]);
  const [beadsByStatus, setBeadsByStatus] =
    useState<Record<BeadStatus, Bead[]>>(EMPTY_GROUPED);
  const [ticketNumbers, setTicketNumbers] = useState<Map<string, number>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track if initial load has completed
  const hasLoadedRef = useRef(false);

  /**
   * Load beads from the project directory
   */
  const loadBeads = useCallback(async () => {
    if (!projectPath) {
      setBeads([]);
      setBeadsByStatus(EMPTY_GROUPED);
      setTicketNumbers(new Map());
      setIsLoading(false);
      return;
    }

    // Only show loading on initial load, not on refreshes
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }

    try {
      const loadedBeads = await loadProjectBeads(projectPath);
      const grouped = groupBeadsByStatus(loadedBeads);
      const tickets = assignTicketNumbers(loadedBeads);

      setBeads(loadedBeads);
      setBeadsByStatus(grouped);
      setTicketNumbers(tickets);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("Failed to load beads:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  /**
   * Public refresh function for manual reload
   */
  const refresh = useCallback(async () => {
    await loadBeads();
  }, [loadBeads]);

  // Initial load when project path changes
  useEffect(() => {
    hasLoadedRef.current = false;
    loadBeads();
  }, [loadBeads]);

  // Set up file watcher for real-time updates
  // Note: useFileWatcher expects the project root path, not the full issues.jsonl path,
  // because the backend watch API appends .beads/issues.jsonl to the provided path
  const { error: watchError } = useFileWatcher(
    projectPath,
    loadBeads,
    100 // 100ms debounce as per spec
  );

  // Combine any watch error with load error
  useEffect(() => {
    if (watchError && !error) {
      // Only log watch errors, don't surface them as main error
      // since the app can still function without file watching
      console.warn("File watcher error:", watchError);
    }
  }, [watchError, error]);

  return {
    beads,
    beadsByStatus,
    ticketNumbers,
    isLoading,
    error,
    refresh,
  };
}
