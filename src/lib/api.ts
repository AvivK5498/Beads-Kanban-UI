/**
 * Frontend API layer for beads-kanban-ui webapp
 * Replaces Tauri invoke() calls with HTTP fetch to backend
 */

import type { Project, Tag, Bead, WorktreeStatus, WorktreeEntry, PRStatus, MemoryResponse, MemoryStats, MemoryEntry } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3008';

/**
 * Input for creating a new project
 */
export interface CreateProjectInput {
  name: string;
  path: string;
}

/**
 * Input for creating a new tag
 */
export interface CreateTagInput {
  name: string;
  color: string;
}

/**
 * File system entry from directory listing
 */
export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/**
 * Git branch status information
 */
export interface BranchStatus {
  exists: boolean;
  ahead: number;
  behind: number;
}

/**
 * BD CLI command result
 */
export interface BdCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * File watcher event
 */
export interface WatchEvent {
  path: string;
  type: string;
}

/**
 * Helper for fetch with error handling
 */
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Projects API
 */
export const projects = {
  list: () => fetchApi<Project[]>('/api/projects'),

  create: (data: CreateProjectInput) => fetchApi<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  update: (id: string, data: Partial<Project>) => fetchApi<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),

  delete: (id: string) => fetchApi<void>(`/api/projects/${id}`, { method: 'DELETE' }),
};

/**
 * Tags API
 */
export const tags = {
  list: () => fetchApi<Tag[]>('/api/tags'),

  create: (data: CreateTagInput) => fetchApi<Tag>('/api/tags', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  delete: (id: string) => fetchApi<void>(`/api/tags/${id}`, { method: 'DELETE' }),

  addToProject: (projectId: string, tagId: string) => fetchApi<void>('/api/project-tags', {
    method: 'POST',
    body: JSON.stringify({ projectId, tagId }),
  }),

  removeFromProject: (projectId: string, tagId: string) => fetchApi<void>(
    `/api/project-tags/${projectId}/${tagId}`,
    { method: 'DELETE' }
  ),
};

/**
 * Beads API
 */
export const beads = {
  read: (path: string) => fetchApi<{ beads: Bead[] }>(
    `/api/beads?path=${encodeURIComponent(path)}`
  ),

  addComment: (path: string, beadId: string, text: string, author: string) =>
    fetchApi<Bead>('/api/beads/comment', {
      method: 'POST',
      body: JSON.stringify({ path, bead_id: beadId, text, author }),
    }),
};

/**
 * BD CLI API
 */
export const bd = {
  command: (args: string[], cwd?: string) => fetchApi<BdCommandResult>('/api/bd/command', {
    method: 'POST',
    body: JSON.stringify({ args, cwd }),
  }),
};

/**
 * Worktree creation response
 */
export interface CreateWorktreeResponse {
  success: boolean;
  worktree_path: string;
  branch: string;
  already_existed: boolean;
}

/**
 * Worktree deletion response
 */
export interface DeleteWorktreeResponse {
  success: boolean;
}

/**
 * List worktrees response
 */
export interface ListWorktreesResponse {
  worktrees: WorktreeEntry[];
}

/**
 * Create PR response
 */
export interface CreatePRResponse {
  success: boolean;
  pr_number?: number;
  pr_url?: string;
  error?: string;
}

/**
 * Merge PR response
 */
export interface MergePRResponse {
  success: boolean;
  merged: boolean;
  error?: string;
}

/**
 * Rebase sibling result
 */
export interface RebaseSiblingResult {
  bead_id: string;
  success: boolean;
  error?: string;
}

/**
 * Rebase siblings response
 */
export interface RebaseSiblingsResponse {
  results: RebaseSiblingResult[];
}

/**
 * Merge method for PR merging
 */
export type MergeMethod = 'merge' | 'squash' | 'rebase';

/**
 * GitHub status response
 */
export interface GitHubStatusResponse {
  has_remote: boolean;
  gh_authenticated: boolean;
  error?: string;
}

/**
 * Git API
 */
export const git = {
  /**
   * Get GitHub status for a repository
   */
  githubStatus: (repoPath: string) => fetchApi<GitHubStatusResponse>(
    `/api/git/github-status?repo_path=${encodeURIComponent(repoPath)}`
  ),
  /**
   * Get branch status relative to main
   * @deprecated Use `worktreeStatus()` instead. Branch-based workflow is deprecated in favor of worktrees.
   */
  branchStatus: (path: string, branch: string) => fetchApi<BranchStatus>(
    `/api/git/branch-status?path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`
  ),

  // Worktree endpoints
  worktreeStatus: (repoPath: string, beadId: string) => fetchApi<WorktreeStatus>(
    `/api/git/worktree-status?repo_path=${encodeURIComponent(repoPath)}&bead_id=${encodeURIComponent(beadId)}`
  ),

  createWorktree: (repoPath: string, beadId: string, baseBranch = 'main') =>
    fetchApi<CreateWorktreeResponse>('/api/git/worktree', {
      method: 'POST',
      body: JSON.stringify({ repo_path: repoPath, bead_id: beadId, base_branch: baseBranch }),
    }),

  deleteWorktree: (repoPath: string, beadId: string) =>
    fetchApi<DeleteWorktreeResponse>('/api/git/worktree', {
      method: 'DELETE',
      body: JSON.stringify({ repo_path: repoPath, bead_id: beadId }),
    }),

  listWorktrees: (repoPath: string) => fetchApi<ListWorktreesResponse>(
    `/api/git/worktrees?repo_path=${encodeURIComponent(repoPath)}`
  ),

  // PR endpoints
  prStatus: (repoPath: string, beadId: string) => fetchApi<PRStatus>(
    `/api/git/pr-status?repo_path=${encodeURIComponent(repoPath)}&bead_id=${encodeURIComponent(beadId)}`
  ),

  createPR: (repoPath: string, beadId: string, title: string, body: string) =>
    fetchApi<CreatePRResponse>('/api/git/create-pr', {
      method: 'POST',
      body: JSON.stringify({ repo_path: repoPath, bead_id: beadId, title, body }),
    }),

  mergePR: (repoPath: string, beadId: string, mergeMethod: MergeMethod = 'squash') =>
    fetchApi<MergePRResponse>('/api/git/merge-pr', {
      method: 'POST',
      body: JSON.stringify({ repo_path: repoPath, bead_id: beadId, merge_method: mergeMethod }),
    }),

  rebaseSiblings: (repoPath: string, excludeBeadId: string) =>
    fetchApi<RebaseSiblingsResponse>('/api/git/rebase-siblings', {
      method: 'POST',
      body: JSON.stringify({ repo_path: repoPath, exclude_bead_id: excludeBeadId }),
    }),
};

/**
 * File System API
 */
export const fs = {
  list: (path: string) => fetchApi<{ entries: FsEntry[] }>(
    `/api/fs/list?path=${encodeURIComponent(path)}`
  ),

  exists: (path: string) => fetchApi<{ exists: boolean }>(
    `/api/fs/exists?path=${encodeURIComponent(path)}`
  ),

  openExternal: (path: string, target: 'vscode' | 'cursor' | 'finder') =>
    fetchApi<{ success: boolean }>('/api/fs/open-external', {
      method: 'POST',
      body: JSON.stringify({ path, target }),
    }),
};

/**
 * Memory API
 */
export const memory = {
  /** Fetch all memory entries and stats */
  list: (path: string) => fetchApi<MemoryResponse>(
    `/api/memory?path=${encodeURIComponent(path)}`
  ),

  /** Fetch memory stats only (lightweight) */
  stats: (path: string) => fetchApi<MemoryStats>(
    `/api/memory/stats?path=${encodeURIComponent(path)}`
  ),

  /** Update an entry's content and/or tags */
  update: (path: string, key: string, content?: string, tags?: string[]) =>
    fetchApi<{ success: boolean; entry: MemoryEntry }>('/api/memory', {
      method: 'PUT',
      body: JSON.stringify({ path, key, content, tags }),
    }),

  /** Delete or archive an entry */
  remove: (path: string, key: string, archive: boolean) =>
    fetchApi<{ success: boolean; archived: boolean }>('/api/memory', {
      method: 'DELETE',
      body: JSON.stringify({ path, key, archive }),
    }),
};

/**
 * File Watcher (Server-Sent Events)
 */
export const watch = {
  beads: (path: string, onEvent: (event: WatchEvent) => void) => {
    const eventSource = new EventSource(
      `${API_BASE}/api/watch/beads?path=${encodeURIComponent(path)}`
    );
    eventSource.onmessage = (e) => onEvent(JSON.parse(e.data));
    eventSource.onerror = () => eventSource.close();
    return () => eventSource.close();
  },
};
