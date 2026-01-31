"use client";

import { useState, useEffect, useCallback } from "react";

import { getProjectWithTags, type Project, type Tag } from "@/lib/db";

export interface ProjectWithTags extends Project {
  tags: Tag[];
}

interface UseProjectResult {
  project: ProjectWithTags | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single project by ID from SQLite
 *
 * @param projectId - The ID of the project to fetch
 * @returns Object containing project data, loading state, error, and refetch function
 */
export function useProject(projectId: string | null): UseProjectResult {
  const [project, setProject] = useState<ProjectWithTags | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProject = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await getProjectWithTags(projectId);
      setProject(data);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch project")
      );
      setProject(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return {
    project,
    isLoading,
    error,
    refetch: fetchProject,
  };
}
