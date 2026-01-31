/**
 * CLI wrapper for bd (beads) commands via HTTP API
 *
 * Provides typed async functions for interacting with the bd CLI tool
 * through the backend API.
 */

import type { BeadStatus } from "@/types";

import * as api from './api';

/**
 * Result from executing a CLI command
 */
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Execute a bd CLI command with the given arguments
 *
 * @param args - Array of command arguments (excluding 'bd')
 * @param cwd - Working directory for the command
 * @returns Promise resolving to command result
 */
async function executeBdCommand(
  args: string[],
  cwd?: string
): Promise<CommandResult> {
  const result = await api.bd.command(args, cwd);

  return {
    success: result.code === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
  };
}

/**
 * Add a comment to a bead
 *
 * Executes: bd comment <beadId> "<message>"
 *
 * @param beadId - The ID of the bead to comment on
 * @param message - The comment message
 * @param cwd - Working directory (project path)
 * @throws Error if command fails
 *
 * @example
 * ```typescript
 * await addComment('BD-001', 'Fixed the bug', '/path/to/project');
 * ```
 */
export async function addComment(
  beadId: string,
  message: string,
  cwd?: string
): Promise<void> {
  const result = await executeBdCommand(["comment", beadId, message], cwd);

  if (!result.success) {
    throw new Error(result.stderr || `Failed to add comment: exit code ${result.code}`);
  }
}

/**
 * Update the status of a bead
 *
 * Executes: bd update <beadId> --status <status>
 *
 * @param beadId - The ID of the bead to update
 * @param status - The new status value
 * @param cwd - Working directory (project path)
 * @throws Error if command fails
 *
 * @example
 * ```typescript
 * await updateStatus('BD-001', 'in_progress', '/path/to/project');
 * ```
 */
export async function updateStatus(
  beadId: string,
  status: BeadStatus,
  cwd?: string
): Promise<void> {
  const result = await executeBdCommand(
    ["update", beadId, "--status", status],
    cwd
  );

  if (!result.success) {
    throw new Error(result.stderr || `Failed to update status: exit code ${result.code}`);
  }
}

/**
 * Close a bead
 *
 * Executes: bd close <beadId>
 *
 * @param beadId - The ID of the bead to close
 * @param cwd - Working directory (project path)
 * @throws Error if command fails
 *
 * @example
 * ```typescript
 * await closeBead('BD-001', '/path/to/project');
 * ```
 */
export async function closeBead(beadId: string, cwd?: string): Promise<void> {
  const result = await executeBdCommand(["close", beadId], cwd);

  if (!result.success) {
    throw new Error(result.stderr || `Failed to close bead: exit code ${result.code}`);
  }
}

/**
 * Create a new bead
 *
 * Executes: bd create "<title>" -d "<description>"
 *
 * @param title - The bead title
 * @param description - The bead description
 * @param cwd - Working directory (project path)
 * @returns The created bead ID (if parseable from output)
 * @throws Error if command fails
 *
 * @example
 * ```typescript
 * const id = await createBead('Fix bug', 'Bug in login form', '/path/to/project');
 * ```
 */
export async function createBead(
  title: string,
  description: string,
  cwd?: string
): Promise<string | null> {
  const result = await executeBdCommand(
    ["create", title, "-d", description],
    cwd
  );

  if (!result.success) {
    throw new Error(result.stderr || `Failed to create bead: exit code ${result.code}`);
  }

  // Try to extract bead ID from output (format varies by CLI version)
  const idMatch = result.stdout.match(/(?:BD-|bd-)[\w-]+/i);
  return idMatch ? idMatch[0] : null;
}

/**
 * Get bead details
 *
 * Executes: bd show <beadId>
 *
 * @param beadId - The ID of the bead to show
 * @param cwd - Working directory (project path)
 * @returns Raw output from bd show command
 * @throws Error if command fails
 */
export async function showBead(beadId: string, cwd?: string): Promise<string> {
  const result = await executeBdCommand(["show", beadId], cwd);

  if (!result.success) {
    throw new Error(result.stderr || `Failed to show bead: exit code ${result.code}`);
  }

  return result.stdout;
}

/**
 * List all beads
 *
 * Executes: bd list
 *
 * @param cwd - Working directory (project path)
 * @returns Raw output from bd list command
 * @throws Error if command fails
 */
export async function listBeads(cwd?: string): Promise<string> {
  const result = await executeBdCommand(["list"], cwd);

  if (!result.success) {
    throw new Error(result.stderr || `Failed to list beads: exit code ${result.code}`);
  }

  return result.stdout;
}
