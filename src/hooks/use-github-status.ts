"use client";

import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";

export interface GitHubStatusResult {
  hasRemote: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to check GitHub remote and authentication status for a repository.
 * Fetches once when the projectPath changes.
 *
 * @param projectPath - The path to the repository
 * @returns GitHubStatusResult with remote/auth status
 */
export function useGitHubStatus(projectPath: string | null): GitHubStatusResult {
  const [hasRemote, setHasRemote] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!projectPath) {
      // No project path, reset to defaults
      setHasRemote(true);
      setIsAuthenticated(true);
      setIsLoading(false);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await api.git.githubStatus(projectPath);
      setHasRemote(response.has_remote);
      setIsAuthenticated(response.gh_authenticated);
    } catch (err) {
      // If the endpoint fails (e.g., backend not running),
      // treat as "unable to verify" - don't show warning
      setError(err instanceof Error ? err : new Error("Failed to fetch GitHub status"));
      // Default to true so we don't show a warning when we can't verify
      setHasRemote(true);
      setIsAuthenticated(true);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    hasRemote,
    isAuthenticated,
    isLoading,
    error,
    refresh: fetchStatus,
  };
}
