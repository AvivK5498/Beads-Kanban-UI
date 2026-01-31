/**
 * Hook for fetching PR status for a single bead
 *
 * Fetches PR status including remote check, branch push status,
 * PR info, CI checks, and rate limit information.
 */

import { useState, useEffect, useCallback, useRef } from "react";

import * as api from "@/lib/api";
import type { PRStatus } from "@/types";

/** Default polling interval in milliseconds */
const DEFAULT_POLLING_INTERVAL = 30_000;

/**
 * Result type for the usePRStatus hook
 */
export interface UsePRStatusResult {
  /** PR status data (null if not loaded or no PR) */
  status: PRStatus | null;
  /** Whether status is currently being loaded */
  isLoading: boolean;
  /** Any error that occurred during loading */
  error: Error | null;
  /** Manually refresh PR status */
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and track PR status for a single bead
 *
 * @param projectPath - Absolute path to the project git repository
 * @param beadId - Bead ID to check PR status for (null/undefined to disable)
 * @param pollingInterval - Polling interval in milliseconds (default: 30000)
 * @returns Object containing status, loading state, error, and refresh function
 *
 * @example
 * ```tsx
 * function BeadDetail({ projectPath, bead }) {
 *   const { status, isLoading, refresh } = usePRStatus(
 *     projectPath,
 *     bead.id
 *   );
 *
 *   if (isLoading) return <Skeleton />;
 *
 *   return (
 *     <PRStatusDisplay
 *       status={status}
 *       onRefresh={refresh}
 *     />
 *   );
 * }
 * ```
 */
export function usePRStatus(
  projectPath: string,
  beadId: string | null | undefined,
  pollingInterval = DEFAULT_POLLING_INTERVAL
): UsePRStatusResult {
  const [status, setStatus] = useState<PRStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track if initial load has completed
  const hasLoadedRef = useRef(false);

  // Store previous bead ID to detect changes
  const prevBeadIdRef = useRef<string | null>(null);

  /**
   * Load PR status for the bead
   */
  const loadStatus = useCallback(async () => {
    if (!projectPath || !beadId) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    // Only show loading on initial load
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }

    try {
      const prStatus = await api.git.prStatus(projectPath, beadId);
      setStatus(prStatus);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("Failed to load PR status:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, beadId]);

  /**
   * Public refresh function for manual reload
   */
  const refresh = useCallback(async () => {
    await loadStatus();
  }, [loadStatus]);

  // Load status when project path or bead ID changes
  useEffect(() => {
    // Check if bead ID has changed
    if (beadId !== prevBeadIdRef.current) {
      prevBeadIdRef.current = beadId ?? null;
      hasLoadedRef.current = false;
    }

    loadStatus();
  }, [loadStatus, beadId]);

  // Set up periodic refresh (polling)
  useEffect(() => {
    if (!projectPath || !beadId) return;

    const intervalId = setInterval(() => {
      loadStatus();
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [projectPath, beadId, loadStatus, pollingInterval]);

  return {
    status,
    isLoading,
    error,
    refresh,
  };
}
