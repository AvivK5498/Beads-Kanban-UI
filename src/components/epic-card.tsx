"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { CheckCircle2, ChevronDown, ChevronRight, Layers, Loader2, MessageSquare } from "lucide-react";

import { DependencyBadge } from "@/components/dependency-badge";
import { DesignDocPreview } from "@/components/design-doc-preview";
import { SubtaskList, ChildPRStatus } from "@/components/subtask-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import * as api from "@/lib/api";
import { closeBead } from "@/lib/cli";
import { computeEpicProgress } from "@/lib/epic-parser";
import { cn } from "@/lib/utils";
import type { Bead, Epic, EpicProgress } from "@/types";

export interface EpicCardProps {
  /** Epic bead with children */
  epic: Epic;
  /** All beads to resolve children */
  allBeads: Bead[];
  /** Ticket number for display */
  ticketNumber?: number;
  /** Whether this epic is selected */
  isSelected?: boolean;
  /** Callback when selecting this epic */
  onSelect: (epic: Epic) => void;
  /** Callback when clicking a child task */
  onChildClick: (child: Bead) => void;
  /** Callback when navigating to a dependency */
  onNavigateToDependency?: (beadId: string) => void;
  /** Project root path for fetching design docs */
  projectPath?: string;
  /** Callback after epic is closed (to refresh board) */
  onUpdate?: () => void;
}

/**
 * Format bead ID for display
 */
function formatBeadId(id: string): string {
  if (id.startsWith("BD-") || id.startsWith("bd-")) {
    return id.length > 10 ? 'BD-' + id.slice(-6) : id.toUpperCase();
  }
  const parts = id.split("-");
  const shortId = parts[parts.length - 1];
  return 'BD-' + shortId.slice(0, 6);
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "…";
}

/**
 * Compute epic progress from children
 * Uses epic-parser utility for proper dependency resolution
 */
function computeProgress(epic: Epic, allBeads: Bead[]): EpicProgress {
  return computeEpicProgress(epic, allBeads);
}

/**
 * Get progress bar indicator color based on completion percentage
 */
function getProgressIndicatorClass(percentage: number): string {
  if (percentage === 100) return "[&>*]:bg-green-500";
  if (percentage >= 75) return "[&>*]:bg-green-500";
  if (percentage >= 50) return "[&>*]:bg-blue-500";
  if (percentage >= 25) return "[&>*]:bg-amber-500";
  return "[&>*]:bg-purple-500";
}

/** Auto-refresh interval for PR statuses (30 seconds) */
const PR_STATUS_REFRESH_INTERVAL = 30_000;

/**
 * Larger epic card with distinctive styling
 */

export function EpicCard({
  epic,
  allBeads,
  ticketNumber,
  isSelected = false,
  onSelect,
  onChildClick,
  onNavigateToDependency,
  projectPath,
  onUpdate
}: EpicCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDesignPreviewExpanded, setIsDesignPreviewExpanded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // PR status for child tasks
  const [childPRStatuses, setChildPRStatuses] = useState<Map<string, ChildPRStatus>>(new Map());
  const isMountedRef = useRef(true);

  // Resolve children from IDs (memoized to prevent unnecessary re-fetches)
  const children = useMemo(() =>
    (epic.children || [])
      .map(childId => allBeads.find(b => b.id === childId))
      .filter((b): b is Bead => b !== undefined),
    [epic.children, allBeads]
  );

  // Fetch PR status for all children
  const fetchChildPRStatuses = useCallback(async () => {
    if (!projectPath || children.length === 0) return;

    const statusMap = new Map<string, ChildPRStatus>();

    // Fetch PR status for all children in parallel (skip closed - no PR needed)
    const results = await Promise.all(
      children.filter(c => c.status !== 'closed').map(async (child) => {
        try {
          const prStatus = await api.git.prStatus(projectPath, child.id);
          if (prStatus.pr) {
            return {
              id: child.id,
              status: {
                state: prStatus.pr.state,
                checks: { status: prStatus.pr.checks.status },
              } as ChildPRStatus,
            };
          }
        } catch {
          // Ignore errors for individual children
        }
        return null;
      })
    );

    // Build the map from results
    for (const result of results) {
      if (result) {
        statusMap.set(result.id, result.status);
      }
    }

    // Only update state if component is still mounted
    if (isMountedRef.current) {
      setChildPRStatuses(statusMap);
    }
  }, [projectPath, children]);

  // Fetch PR statuses on mount and set up auto-refresh interval
  useEffect(() => {
    isMountedRef.current = true;

    // Initial fetch
    fetchChildPRStatuses();

    // Set up auto-refresh interval
    const intervalId = setInterval(() => {
      fetchChildPRStatuses();
    }, PR_STATUS_REFRESH_INTERVAL);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [fetchChildPRStatuses]);

  const progress = computeProgress(epic, allBeads);
  const progressPercentage = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const commentCount = (epic.comments ?? []).length;
  const hasDesignDoc = !!epic.design_doc;

  // Show Close Epic button when all children are complete and epic is in review
  const canCloseEpic = progressPercentage === 100 && epic.status === 'inreview';

  /**
   * Handle closing the epic
   */
  const handleCloseEpic = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isClosing) return;

    setIsClosing(true);
    try {
      await closeBead(epic.id, projectPath);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to close epic:', error);
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div
      data-bead-id={epic.id}
      role="button"
      tabIndex={0}
      aria-label={`Select epic: ${epic.title}`}
      className={cn(
        "rounded-lg cursor-pointer p-4",
        "bg-zinc-900/70 backdrop-blur-md",
        "border border-zinc-800/60 border-l-2 border-l-purple-500",
        "shadow-sm shadow-black/20",
        "transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30",
        "hover:border-zinc-700",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]",
        isSelected && "ring-2 ring-purple-400 ring-offset-2 ring-offset-[#0a0a0a]"
      )}
      onClick={() => onSelect(epic)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(epic);
        }
      }}
    >
      <div className="space-y-3">
        {/* Header: Ticket # + Epic Icon + ID + Dependencies */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" aria-hidden="true" />
            <span className="text-xs font-mono text-zinc-400">
              {ticketNumber !== undefined && (
                <span className="font-semibold text-white">#{ticketNumber}</span>
              )}
              {ticketNumber !== undefined && " "}
              {formatBeadId(epic.id)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <DependencyBadge
              deps={epic.deps}
              blockers={epic.blockers}
              onNavigate={onNavigateToDependency}
            />
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0.5 border-purple-500/30 text-purple-400 bg-purple-500/20 font-semibold"
            >
              EPIC
            </Badge>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-bold text-base leading-tight text-purple-100">
          {truncate(epic.title, 60)}
        </h3>

        {/* Description */}
        {epic.description && (
          <p className="text-xs text-zinc-400 leading-relaxed">
            {truncate(epic.description, 100)}
          </p>
        )}

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">
              Progress: {progress.completed}/{progress.total} completed
            </span>
            <span className="font-semibold text-zinc-300">{progressPercentage}%</span>
          </div>
          <Progress
            value={progressPercentage}
            aria-label={`Epic progress: ${progress.completed} of ${progress.total} completed`}
            className={cn(
              "h-2 bg-zinc-800",
              getProgressIndicatorClass(progressPercentage)
            )}
          />
          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
              {progress.inProgress} in progress
            </span>
            {progress.blocked > 0 && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
                {progress.blocked} blocked
              </span>
            )}
          </div>
        </div>

        {/* Close Epic Button - shown when all children complete and status is inreview */}
        {canCloseEpic && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="xs"
              onClick={handleCloseEpic}
              disabled={isClosing}
              className="w-full border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-300"
            >
              {isClosing ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3" aria-hidden="true" />
              )}
              {isClosing ? 'Closing…' : 'Close Epic'}
            </Button>
          </div>
        )}

        {/* Design Doc Preview */}
        {hasDesignDoc && projectPath && (
          <div className="pt-2 border-t border-zinc-700">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDesignPreviewExpanded(!isDesignPreviewExpanded);
              }}
              aria-expanded={isDesignPreviewExpanded}
              aria-label={`${isDesignPreviewExpanded ? 'Collapse' : 'Expand'} design preview`}
              className="flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 rounded mb-2"
            >
              {isDesignPreviewExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Design Preview
            </button>
            {isDesignPreviewExpanded && (
              <DesignDocPreview
                designDocPath={epic.design_doc!}
                epicId={epic.id}
                projectPath={projectPath}
              />
            )}
          </div>
        )}

        {/* Children Preview/List */}
        <div className="pt-2 border-t border-zinc-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} child tasks`}
            className="flex items-center gap-1 text-xs font-semibold text-purple-400 hover:text-purple-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 rounded mb-2"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Child Tasks ({children.length})
          </button>
          <SubtaskList
            childTasks={children}
            onChildClick={onChildClick}
            maxCollapsed={3}
            isExpanded={isExpanded}
            childPRStatuses={childPRStatuses}
          />
        </div>

        {/* Footer: comment count */}
        {commentCount > 0 && (
          <div className="flex items-center pt-2">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
