"use client";

/**
 * Hook for managing epic-specific state and filtering.
 *
 * Derived from useBeads, provides:
 * - Top-level beads only (no child tasks)
 * - Separated epics and standalone tasks
 * - Epic progress computation
 * - Expansion state management
 */

import { useMemo, useState, useCallback } from "react";

import type { Bead, Epic, EpicProgress } from "@/types";

/**
 * Result type for the useEpics hook
 */
export interface UseEpicsResult {
  /** Top-level beads only (no children) */
  topLevelBeads: Bead[];
  /** Epics with computed progress */
  epics: Epic[];
  /** Standalone tasks (not epics, not children) */
  standaloneTasks: Bead[];
  /** Map of epic ID to expansion state */
  expandedEpics: Set<string>;
  /** Toggle epic expansion */
  toggleEpic: (epicId: string) => void;
  /** Expand all epics */
  expandAll: () => void;
  /** Collapse all epics */
  collapseAll: () => void;
  /** Check if epic is expanded */
  isExpanded: (epicId: string) => boolean;
}

/**
 * Compute progress metrics for an epic based on its children
 */
function computeEpicProgress(children: Bead[]): EpicProgress {
  const total = children.length;
  const completed = children.filter(c => c.status === 'closed').length;
  const inProgress = children.filter(c => c.status === 'in_progress').length;
  // Blocked = has unresolved dependencies
  const blocked = children.filter(c => (c.deps?.length ?? 0) > 0).length;

  return { total, completed, inProgress, blocked };
}

/**
 * Type guard to check if a bead is an epic
 */
function isEpic(bead: Bead): bead is Epic {
  return bead.issue_type === 'epic';
}

/**
 * Hook to manage epic state and filtering
 *
 * @param beads - All beads from the project
 * @returns Object with top-level beads, epics, tasks, and expansion controls
 *
 * @example
 * ```tsx
 * function KanbanBoard() {
 *   const { beads } = useBeads(projectPath);
 *   const { topLevelBeads, epics, standaloneTasks, isExpanded, toggleEpic } = useEpics(beads);
 *
 *   return (
 *     <div>
 *       {topLevelBeads.map(bead =>
 *         isEpic(bead)
 *           ? <EpicCard epic={bead} isExpanded={isExpanded(bead.id)} />
 *           : <BeadCard bead={bead} />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEpics(beads: Bead[]): UseEpicsResult {
  // Track expanded epic IDs
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());

  /**
   * Filter to only top-level beads (no parent_id)
   * This prevents child tasks from appearing in columns
   */
  const topLevelBeads = useMemo(() => {
    return beads.filter(b => !b.parent_id);
  }, [beads]);

  /**
   * Separate epics from standalone tasks and compute progress
   */
  const { epics, standaloneTasks } = useMemo(() => {
    const epicsList: Epic[] = [];
    const tasksList: Bead[] = [];

    for (const bead of topLevelBeads) {
      if (isEpic(bead)) {
        // Resolve children from all beads (including child tasks)
        const children = (bead.children || [])
          .map(childId => beads.find(b => b.id === childId))
          .filter((b): b is Bead => b !== undefined);

        // Compute progress
        const progress = computeEpicProgress(children);

        epicsList.push({
          ...bead,
          progress
        });
      } else {
        tasksList.push(bead);
      }
    }

    return {
      epics: epicsList,
      standaloneTasks: tasksList
    };
  }, [topLevelBeads, beads]);

  /**
   * Toggle epic expansion state
   * Uses functional update to avoid stale closure issues
   */
  const toggleEpic = useCallback((epicId: string) => {
    setExpandedEpics(current => {
      const next = new Set(current);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  }, []);

  /**
   * Expand all epics
   */
  const expandAll = useCallback(() => {
    setExpandedEpics(new Set(epics.map(e => e.id)));
  }, [epics]);

  /**
   * Collapse all epics
   */
  const collapseAll = useCallback(() => {
    setExpandedEpics(new Set());
  }, []);

  /**
   * Check if an epic is expanded
   */
  const isExpanded = useCallback((epicId: string) => {
    return expandedEpics.has(epicId);
  }, [expandedEpics]);

  return {
    topLevelBeads,
    epics,
    standaloneTasks,
    expandedEpics,
    toggleEpic,
    expandAll,
    collapseAll,
    isExpanded
  };
}
