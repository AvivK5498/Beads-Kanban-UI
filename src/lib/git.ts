/**
 * Git utilities for branch status via HTTP API
 *
 * Provides functions to check branch existence and ahead/behind status
 * relative to the main branch.
 *
 * @deprecated This module is deprecated. Use the worktree API endpoints instead.
 * Branch-based workflow is being phased out in favor of worktrees.
 * See `api.git.worktreeStatus()` and `api.git.createWorktree()` for the new workflow.
 */

import * as api from './api';

/**
 * Branch status relative to main
 */
export interface BranchStatus {
  /** Whether the branch exists locally */
  exists: boolean;
  /** Number of commits ahead of main */
  ahead: number;
  /** Number of commits behind main */
  behind: number;
}

/**
 * Get branch status (exists, ahead, behind) relative to main
 *
 * @deprecated Use `api.git.worktreeStatus()` instead. Branch-based workflow is deprecated.
 *
 * @param projectPath - Absolute path to the git repository
 * @param branchName - Name of the branch to check status for
 * @returns Promise resolving to BranchStatus
 *
 * @example
 * ```typescript
 * const status = await getBranchStatus('/path/to/repo', 'bd-BD-001');
 * if (status.exists) {
 *   console.log(`Branch is ${status.ahead} ahead, ${status.behind} behind main`);
 * }
 * ```
 */
export async function getBranchStatus(
  projectPath: string,
  branchName: string
): Promise<BranchStatus> {
  return api.git.branchStatus(projectPath, branchName);
}

/**
 * Check if a branch exists locally
 *
 * @deprecated Use `api.git.worktreeStatus()` instead. Branch-based workflow is deprecated.
 *
 * @param projectPath - Absolute path to the git repository
 * @param branchName - Name of the branch to check
 * @returns Promise resolving to true if branch exists
 *
 * @example
 * ```typescript
 * const exists = await branchExists('/path/to/repo', 'bd-BD-001');
 * ```
 */
export async function branchExists(
  projectPath: string,
  branchName: string
): Promise<boolean> {
  const status = await getBranchStatus(projectPath, branchName);
  return status.exists;
}

/**
 * Get branch statuses for multiple branches in batch
 *
 * Runs checks in parallel for efficiency.
 *
 * @deprecated Use the worktree API instead. Branch-based workflow is deprecated.
 *
 * @param projectPath - Absolute path to the git repository
 * @param branchNames - Array of branch names to check
 * @returns Promise resolving to a map of branch name to status
 *
 * @example
 * ```typescript
 * const statuses = await getBatchBranchStatus('/path/to/repo', [
 *   'bd-BD-001',
 *   'bd-BD-002',
 *   'bd-BD-003'
 * ]);
 * ```
 */
export async function getBatchBranchStatus(
  projectPath: string,
  branchNames: string[]
): Promise<Record<string, BranchStatus>> {
  const results: Record<string, BranchStatus> = {};

  // Run all checks in parallel
  const promises = branchNames.map(async (branchName) => {
    try {
      const status = await getBranchStatus(projectPath, branchName);
      results[branchName] = status;
    } catch {
      // If there's an error, assume branch doesn't exist
      results[branchName] = { exists: false, ahead: 0, behind: 0 };
    }
  });

  await Promise.all(promises);

  return results;
}
