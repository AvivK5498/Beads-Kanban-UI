"use client";

/**
 * Hook for watching file changes via SSE (Server-Sent Events).
 *
 * Uses the backend API to watch for file changes and emit events
 * to the frontend. Includes debouncing to prevent rapid-fire callbacks.
 */

import { useEffect, useState, useRef, useCallback } from "react";

import * as api from "@/lib/api";

/** Return type for the useFileWatcher hook. */
interface UseFileWatcherResult {
  /** Whether the file is currently being watched. */
  isWatching: boolean;
  /** Any error that occurred while setting up or running the watcher. */
  error: Error | null;
}

/**
 * Hook to watch a project's beads file for changes and trigger a callback when it changes.
 *
 * @param projectPath - The absolute path to the project root directory (not the issues.jsonl file).
 *                      The backend API will append .beads/issues.jsonl to this path.
 * @param onFileChange - Callback function to run when the file changes.
 * @param debounceMs - Debounce interval in milliseconds (default: 100).
 * @returns Object containing isWatching status and any error.
 *
 * @example
 * ```tsx
 * const { isWatching, error } = useFileWatcher(
 *   "/path/to/project",
 *   () => {
 *     refetchIssues();
 *   },
 *   100
 * );
 * ```
 */
export function useFileWatcher(
  projectPath: string,
  onFileChange: () => void,
  debounceMs: number = 100
): UseFileWatcherResult {
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Use refs to store the callback and debounce timer to avoid effect re-runs
  const callbackRef = useRef(onFileChange);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = onFileChange;
  }, [onFileChange]);

  // Debounced callback handler
  const handleFileChange = useCallback(() => {
    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      callbackRef.current();
      debounceTimerRef.current = null;
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    // Don't set up watcher if no project path provided
    if (!projectPath) {
      return;
    }

    let cleanup: (() => void) | null = null;

    try {
      // Set up the SSE watcher via API
      cleanup = api.watch.beads(projectPath, () => {
        handleFileChange();
      });

      setIsWatching(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsWatching(false);
    }

    // Cleanup function
    return () => {
      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Close SSE connection
      if (cleanup) {
        cleanup();
      }

      setIsWatching(false);
    };
  }, [projectPath, handleFileChange]);

  return { isWatching, error };
}
