/**
 * Parser for beads data via HTTP API
 *
 * Fetches and provides typed access to beads with helper functions for
 * common operations.
 */

import type { Bead, BeadStatus, Epic, KnownRawStatus, StatusBadgeInfo } from "@/types";
import { STATUS_MAP } from "@/types";

import * as api from './api';

/**
 * Check if a raw status string is a known status in the STATUS_MAP
 */
function isKnownStatus(status: string): status is KnownRawStatus {
  return status in STATUS_MAP;
}

/**
 * Map a raw status string from the backend to a BeadStatus column,
 * attaching _originalStatus and _statusBadge when the status is mapped.
 *
 * Returns null for tombstone beads (should be filtered out).
 * Returns the bead with mapped status for known statuses.
 * Returns the bead mapped to 'open' with _originalStatus for unknown statuses.
 */
function mapBeadStatus(bead: Bead): Bead | null {
  const rawStatus = bead.status as string;

  // Known status — look up mapping
  if (isKnownStatus(rawStatus)) {
    const mapping = STATUS_MAP[rawStatus];

    // tombstone → hide
    if (mapping === null) return null;

    // Native column status (no mapping needed)
    if (mapping.column === rawStatus && !mapping.badge) {
      return bead;
    }

    // Mapped status — attach metadata
    return {
      ...bead,
      status: mapping.column,
      _originalStatus: rawStatus,
      _statusBadge: mapping.badge,
    };
  }

  // Unknown status — map to open column with original status preserved
  return {
    ...bead,
    status: 'open' as BeadStatus,
    _originalStatus: rawStatus,
    _statusBadge: { label: rawStatus, variant: 'warning' },
  };
}

/**
 * Get beads that have truly unknown statuses (not in the known mapping).
 * Useful for showing a warning indicator in the UI.
 *
 * @param beads - Array of beads (already mapped by loadProjectBeads)
 * @returns Array of beads with unknown original statuses
 */
export function getUnknownStatusBeads(beads: Bead[]): Bead[] {
  return beads.filter((bead) => {
    if (!bead._originalStatus) return false;
    return !isKnownStatus(bead._originalStatus);
  });
}

/**
 * Get a deduplicated list of unknown status names from beads.
 *
 * @param beads - Array of beads (already mapped)
 * @returns Array of unique unknown status strings
 */
export function getUnknownStatusNames(beads: Bead[]): string[] {
  const unknownBeads = getUnknownStatusBeads(beads);
  const names = new Set<string>();
  for (const bead of unknownBeads) {
    if (bead._originalStatus) {
      names.add(bead._originalStatus);
    }
  }
  return Array.from(names).sort();
}

/**
 * Loads beads from a project directory via API
 *
 * Maps raw statuses from the backend to the 4 kanban columns,
 * filters out tombstone beads, and attaches badge metadata for
 * beads with non-native statuses.
 *
 * @param projectPath - The root path of the project
 * @returns Promise resolving to array of Bead objects
 *
 * @example
 * ```typescript
 * const beads = await loadProjectBeads('/path/to/project');
 * ```
 */
export async function loadProjectBeads(projectPath: string): Promise<Bead[]> {
  try {
    const result = await api.beads.read(projectPath);
    // Map statuses, filter tombstones, ensure comments array
    const mapped: Bead[] = [];
    for (const bead of result.beads) {
      const withComments = { ...bead, comments: bead.comments ?? [] };
      const mappedBead = mapBeadStatus(withComments);
      if (mappedBead !== null) {
        mapped.push(mappedBead);
      }
    }
    return mapped;
  } catch (error) {
    console.error(`Failed to load beads from ${projectPath}:`, error);
    return [];
  }
}

/**
 * Alias for loadProjectBeads for backward compatibility
 */
export async function parseBeadsFromPath(projectPath: string): Promise<Bead[]> {
  return loadProjectBeads(projectPath);
}

/**
 * Groups beads by their status into a record
 *
 * @param beads - Array of Bead objects to group
 * @returns Record with status keys and arrays of beads as values
 *
 * @example
 * ```typescript
 * const grouped = groupBeadsByStatus(beads);
 * console.log(grouped.open.length); // Number of open beads
 * console.log(grouped.closed.length); // Number of closed beads
 * ```
 */
export function groupBeadsByStatus(beads: Bead[]): Record<BeadStatus, Bead[]> {
  const grouped: Record<BeadStatus, Bead[]> = {
    open: [],
    in_progress: [],
    inreview: [],
    closed: [],
  };

  for (const bead of beads) {
    // Defensive: if status is somehow not one of the 4 columns, fall back to open
    const column = grouped[bead.status] ? bead.status : 'open';
    grouped[column].push(bead);
  }

  // Sort each group by updated_at descending (most recent first)
  for (const status of Object.keys(grouped) as BeadStatus[]) {
    grouped[status].sort((a, b) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA;
    });
  }

  return grouped;
}

/**
 * Finds a bead by its ID
 *
 * @param beads - Array of Bead objects to search
 * @param id - The bead ID to find
 * @returns The matching Bead or undefined if not found
 *
 * @example
 * ```typescript
 * const bead = getBeadById(beads, 'beads-kanban-ui-323');
 * if (bead) {
 *   console.log(bead.title);
 * }
 * ```
 */
export function getBeadById(beads: Bead[], id: string): Bead | undefined {
  return beads.find((bead) => bead.id === id);
}

/**
 * Constructs the path to issues.jsonl from a project path
 *
 * @param projectPath - The root path of the project
 * @returns Path to the issues.jsonl file
 */
export function getBeadsFilePath(projectPath: string): string {
  // Normalize path separators and ensure no trailing slash
  const normalizedPath = projectPath.replace(/\\/g, "/").replace(/\/$/, "");
  return `${normalizedPath}/.beads/issues.jsonl`;
}

/**
 * Assigns sequential ticket numbers to beads based on creation order
 *
 * @param beads - Array of Bead objects to assign numbers to
 * @returns Map of bead ID to ticket number (1-indexed, oldest bead = #1)
 *
 * @example
 * ```typescript
 * const ticketNumbers = assignTicketNumbers(beads);
 * const ticketNum = ticketNumbers.get('beads-kanban-ui-323'); // e.g., 5
 * console.log(`#${ticketNum}`); // "#5"
 * ```
 */
export function assignTicketNumbers(beads: Bead[]): Map<string, number> {
  // Sort all beads by created_at ascending (oldest first)
  const sortedBeads = [...beads].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateA - dateB;
  });

  // Assign 1-indexed ticket numbers
  const ticketNumbers = new Map<string, number>();
  sortedBeads.forEach((bead, index) => {
    ticketNumbers.set(bead.id, index + 1);
  });

  return ticketNumbers;
}

/**
 * Groups beads by epic status for epic-specific views
 *
 * @param beads - Array of Bead objects to group
 * @returns Record with epic status keys (with_children, standalone) and arrays of beads
 *
 * @example
 * ```typescript
 * const grouped = groupByEpicStatus(beads);
 * console.log(grouped.epics.length); // Number of epic beads
 * console.log(grouped.standalone.length); // Number of standalone task beads
 * ```
 */
export function groupByEpicStatus(beads: Bead[]): {
  epics: Epic[];
  standalone: Bead[];
  children: Bead[];
} {
  const epics: Epic[] = [];
  const standalone: Bead[] = [];
  const children: Bead[] = [];

  for (const bead of beads) {
    // Epic: has issue_type 'epic' or has children
    if (bead.issue_type === 'epic' || (bead.children && bead.children.length > 0)) {
      epics.push({
        ...bead,
        issue_type: 'epic',
        children: bead.children ?? [],
      } as Epic);
    }
    // Child: has parent_id
    else if (bead.parent_id) {
      children.push(bead);
    }
    // Standalone: no parent, not an epic
    else {
      standalone.push(bead);
    }
  }

  return { epics, standalone, children };
}

/**
 * Gets all child beads for a specific epic
 *
 * @param epicId - The ID of the epic to get children for
 * @param beads - Array of all beads to search
 * @returns Array of child beads belonging to the epic
 *
 * @example
 * ```typescript
 * const children = getEpicChildren('epic-123', allBeads);
 * console.log(`Epic has ${children.length} children`);
 * ```
 */
export function getEpicChildren(epicId: string, beads: Bead[]): Bead[] {
  if (!epicId || !beads || beads.length === 0) {
    return [];
  }

  // Find the epic first
  const epic = beads.find((b) => b.id === epicId);
  if (!epic || !epic.children || epic.children.length === 0) {
    return [];
  }

  // Create a lookup map for fast access
  const beadMap = new Map<string, Bead>();
  for (const bead of beads) {
    beadMap.set(bead.id, bead);
  }

  // Resolve children
  return epic.children
    .map((childId) => beadMap.get(childId))
    .filter((child): child is Bead => child !== undefined);
}

/**
 * Checks if an epic is completed (all children closed)
 *
 * @param epic - The epic bead to check
 * @param beads - Array of all beads to resolve children from
 * @returns True if all children are closed, false otherwise
 *
 * @example
 * ```typescript
 * if (isEpicCompleted(epic, allBeads)) {
 *   console.log('Epic is fully completed!');
 * }
 * ```
 */
export function isEpicCompleted(epic: Epic, beads: Bead[]): boolean {
  if (!epic.children || epic.children.length === 0) {
    // Epic with no children is considered completed
    return true;
  }

  if (!beads || beads.length === 0) {
    return false;
  }

  const children = getEpicChildren(epic.id, beads);
  if (children.length === 0) {
    return false;
  }

  // All children must be closed
  return children.every((child) => child.status === 'closed');
}
