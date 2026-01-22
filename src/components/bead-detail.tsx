"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Bead, BeadStatus, WorktreeStatus, PRStatus, PRChecks } from "@/types";
import type { BranchStatus } from "@/lib/git";
import {
  ArrowLeft,
  FolderOpen,
  Calendar,
  GitPullRequest,
  ExternalLink,
  Check,
  X,
  Clock,
  GitMerge,
  Trash2,
  Loader2,
  Upload,
} from "lucide-react";
import { DesignDocViewer } from "@/components/design-doc-viewer";
import { SubtaskList } from "@/components/subtask-list";
import { usePRStatus } from "@/hooks/use-pr-status";
import * as api from "@/lib/api";
import { useState, useEffect, useCallback, useMemo } from "react";

export interface BeadDetailProps {
  bead: Bead;
  ticketNumber?: number;
  /** @deprecated Use worktreeStatus instead */
  branchStatus?: BranchStatus;
  /** Worktree status for the bead */
  worktreeStatus?: WorktreeStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
  /** Project root path (absolute) - required for PR actions */
  projectPath?: string;
  /** All beads for resolving child task IDs */
  allBeads?: Bead[];
  /** Callback when clicking a child task */
  onChildClick?: (child: Bead) => void;
  /** Callback after worktree cleanup (to refresh data) */
  onCleanup?: () => void;
}

/**
 * Get status badge color classes based on status
 */
function getStatusColor(status: BeadStatus): string {
  switch (status) {
    case "open":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "in_progress":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "inreview":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "closed":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
}

/**
 * Get priority badge color classes based on priority level
 */
function getPriorityColor(priority: number): string {
  switch (priority) {
    case 0:
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case 1:
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case 2:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-zinc-600/20 text-zinc-500 border-zinc-600/30";
  }
}

/**
 * Format status for display (e.g., "in_progress" -> "In Progress")
 */
function formatStatus(status: BeadStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In Progress";
    case "inreview":
      return "In Review";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

/**
 * Format bead ID for display (uppercase BD prefix)
 */
function formatBeadId(id: string): string {
  if (id.startsWith("BD-") || id.startsWith("bd-")) {
    return id.toUpperCase();
  }
  const parts = id.split("-");
  const shortId = parts[parts.length - 1];
  return `BD-${shortId.slice(0, 8).toUpperCase()}`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateString;
  }
}

/**
 * Format worktree path for display
 */
function formatWorktreePath(path: string): string {
  const match = path.match(/\.worktrees\/(.+)$/);
  if (match) {
    return `.worktrees/${match[1]}`;
  }
  const parts = path.split("/");
  if (parts.length >= 2) {
    return parts.slice(-2).join("/");
  }
  return path;
}

/**
 * Get check status icon component
 */
function CheckStatusIcon({
  status,
  className,
}: {
  status: "success" | "failure" | "pending";
  className?: string;
}) {
  switch (status) {
    case "success":
      return <Check className={cn("size-3.5 text-green-400", className)} aria-hidden="true" />;
    case "failure":
      return <X className={cn("size-3.5 text-red-400", className)} aria-hidden="true" />;
    case "pending":
      return <Clock className={cn("size-3.5 text-amber-400", className)} aria-hidden="true" />;
  }
}

/**
 * Get overall checks status display
 */
function getChecksStatusDisplay(checks: PRChecks): {
  icon: React.ReactNode;
  text: string;
  className: string;
} {
  const checksText = `${checks.passed}/${checks.total}`;

  if (checks.status === "success") {
    return {
      icon: <Check className="size-4" aria-hidden="true" />,
      text: checksText,
      className: "text-green-400",
    };
  }

  if (checks.status === "pending") {
    return {
      icon: <Clock className="size-4" aria-hidden="true" />,
      text: checksText,
      className: "text-amber-400",
    };
  }

  if (checks.status === "failure") {
    return {
      icon: <X className="size-4" aria-hidden="true" />,
      text: checksText,
      className: "text-red-400",
    };
  }

  return { icon: null, text: checksText, className: "text-zinc-400" };
}

/**
 * Bead detail sheet component - slides in from the right
 * Displays full bead information with metadata grid and description
 *
 * Note: When DesignDocViewer goes fullscreen, we hide the Sheet via CSS and
 * override Radix's scroll lock to allow the MorphingDialog to function properly.
 * This avoids the conflict between Radix Dialog and MorphingDialog scroll locks.
 */
export function BeadDetail({
  bead,
  ticketNumber,
  branchStatus,
  worktreeStatus,
  open,
  onOpenChange,
  children,
  projectPath,
  allBeads,
  onChildClick,
  onCleanup,
}: BeadDetailProps) {
  const branchName = `bd-${formatBeadId(bead.id)}`;
  const [isDesignDocFullScreen, setIsDesignDocFullScreen] = useState(false);
  const hasDesignDoc = !!bead.design_doc;

  // Action loading states
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [isMergingPR, setIsMergingPR] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch PR status when detail panel is open and we have a worktree
  const hasWorktree = worktreeStatus?.exists ?? false;
  const shouldFetchPRStatus = open && hasWorktree && !!projectPath;

  const {
    status: prStatus,
    isLoading: isPRStatusLoading,
    refresh: refreshPRStatus,
  } = usePRStatus(
    projectPath ?? "",
    shouldFetchPRStatus ? bead.id : null
  );

  // Check if this is an epic with children
  const isEpic = bead.children && bead.children.length > 0;

  // Resolve children from IDs
  const childTasks = useMemo(() => {
    if (!isEpic || !allBeads) return [];
    return (bead.children || [])
      .map(childId => allBeads.find(b => b.id === childId))
      .filter((b): b is Bead => b !== undefined);
  }, [isEpic, bead.children, allBeads]);

  // Handle fullscreen state changes from DesignDocViewer
  const handleFullScreenChange = useCallback((isFullScreen: boolean) => {
    setIsDesignDocFullScreen(isFullScreen);
  }, []);

  // Override Radix's scroll lock when MorphingDialog is fullscreen
  // This fixes the pointer-events: none issue on body
  useEffect(() => {
    if (isDesignDocFullScreen) {
      // Remove Radix's scroll lock styles that conflict with MorphingDialog
      document.body.style.pointerEvents = '';
      document.body.style.overflow = 'hidden'; // MorphingDialog will manage this
    }
  }, [isDesignDocFullScreen]);

  // Clear action error when panel closes
  useEffect(() => {
    if (!open) {
      setActionError(null);
    }
  }, [open]);

  /**
   * Handle creating a PR
   */
  const handleCreatePR = useCallback(async () => {
    if (!projectPath) return;

    setIsCreatingPR(true);
    setActionError(null);

    try {
      const prBody = `Closes ${bead.id}\n\n${bead.description ?? ""}`;
      const result = await api.git.createPR(projectPath, bead.id, bead.title, prBody);

      if (!result.success && result.error) {
        setActionError(result.error);
      } else {
        // Refresh PR status to show the new PR
        await refreshPRStatus();
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to create PR";
      setActionError(error);
    } finally {
      setIsCreatingPR(false);
    }
  }, [projectPath, bead.id, bead.title, bead.description, refreshPRStatus]);

  /**
   * Handle merging a PR
   */
  const handleMergePR = useCallback(async () => {
    if (!projectPath) return;

    setIsMergingPR(true);
    setActionError(null);

    try {
      const result = await api.git.mergePR(projectPath, bead.id, "squash");

      if (!result.success && result.error) {
        setActionError(result.error);
      } else {
        // Refresh PR status to show merged state
        await refreshPRStatus();
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to merge PR";
      setActionError(error);
    } finally {
      setIsMergingPR(false);
    }
  }, [projectPath, bead.id, refreshPRStatus]);

  /**
   * Handle cleanup (delete worktree)
   */
  const handleCleanUp = useCallback(async () => {
    if (!projectPath) return;

    setIsCleaningUp(true);
    setActionError(null);

    try {
      const result = await api.git.deleteWorktree(projectPath, bead.id);

      if (!result.success) {
        setActionError("Failed to delete worktree");
      } else {
        // Notify parent to refresh data
        onCleanup?.();
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to clean up";
      setActionError(error);
    } finally {
      setIsCleaningUp(false);
    }
  }, [projectPath, bead.id, onCleanup]);

  /**
   * Open worktree in VS Code
   */
  const handleOpenInIDE = useCallback(async () => {
    if (!worktreeStatus?.worktree_path) return;

    try {
      await api.fs.openExternal(worktreeStatus.worktree_path, "vscode");
    } catch (err) {
      console.error("Failed to open in IDE:", err);
    }
  }, [worktreeStatus?.worktree_path]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            "w-full sm:max-w-lg md:max-w-xl overflow-y-auto bg-[#0a0a0a] border-zinc-800",
            isDesignDocFullScreen && "invisible"
          )}
        >
          {/* Header with Back button */}
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="gap-1.5 -ml-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
          </div>

          <SheetHeader className="space-y-4">
            {/* Ticket Number + Bead ID */}
            <SheetDescription className="text-xs font-mono text-zinc-500">
              {ticketNumber !== undefined && (
                <span className="font-semibold text-zinc-200">#{ticketNumber}</span>
              )}
              {ticketNumber !== undefined && " "}
              {formatBeadId(bead.id)}
            </SheetDescription>

            {/* Title */}
            <SheetTitle className="text-xl font-semibold leading-tight text-zinc-100">
              {bead.title}
            </SheetTitle>
          </SheetHeader>

          {/* Metadata Grid */}
          <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {/* Status */}
              <div className="space-y-1">
                <span className="text-zinc-500 text-xs">Status</span>
                <div>
                  <Badge
                    variant="outline"
                    className={cn("font-medium", getStatusColor(bead.status))}
                  >
                    {formatStatus(bead.status)}
                  </Badge>
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-1">
                <span className="text-zinc-500 text-xs">Priority</span>
                <div>
                  <Badge
                    variant="outline"
                    className={cn("font-medium", getPriorityColor(bead.priority))}
                  >
                    P{bead.priority}
                  </Badge>
                </div>
              </div>

              {/* Type */}
              <div className="space-y-1">
                <span className="text-zinc-500 text-xs">Type</span>
                <div>
                  <Badge variant="outline" className="font-normal capitalize text-zinc-200 border-zinc-700">
                    {bead.issue_type}
                  </Badge>
                </div>
              </div>

              {/* Worktree */}
              <div className="space-y-1">
                <span className="text-zinc-500 text-xs">Worktree</span>
                <div className="space-y-1.5">
                  {hasWorktree && worktreeStatus?.worktree_path ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <FolderOpen className="size-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
                        <span className="font-mono text-xs text-zinc-200 truncate">
                          {formatWorktreePath(worktreeStatus.worktree_path)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-6 px-2 text-[10px] text-zinc-400 hover:text-zinc-200"
                        onClick={handleOpenInIDE}
                      >
                        <ExternalLink className="size-3 mr-1" aria-hidden="true" />
                        Open in IDE
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-500">No worktree</span>
                  )}
                </div>
              </div>

              {/* Created */}
              <div className="space-y-1">
                <span className="text-zinc-500 text-xs">Created</span>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                  <span className="text-xs text-zinc-200">{formatDate(bead.created_at)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pull Request Section */}
          {hasWorktree && projectPath && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2 text-zinc-200">Pull Request</h3>
              <div className="h-px bg-zinc-800 mb-3" />

              {/* Loading state */}
              {isPRStatusLoading && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <span>Loading PR status...</span>
                  </div>
                </div>
              )}

              {/* Error state */}
              {actionError && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-red-400">{actionError}</p>
                </div>
              )}

              {/* No remote state */}
              {!isPRStatusLoading && prStatus && !prStatus.has_remote && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-sm text-zinc-400">
                    No remote configured. Push to a remote to enable PR features.
                  </p>
                </div>
              )}

              {/* Branch not pushed state */}
              {!isPRStatusLoading && prStatus?.has_remote && !prStatus.branch_pushed && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-400">Branch not pushed to remote</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled
                    >
                      <Upload className="size-3.5" aria-hidden="true" />
                      Push Branch
                    </Button>
                  </div>
                </div>
              )}

              {/* No PR yet - show Create PR button */}
              {!isPRStatusLoading && prStatus?.has_remote && prStatus.branch_pushed && !prStatus.pr && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-400">No pull request created yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleCreatePR}
                      disabled={isCreatingPR}
                    >
                      {isCreatingPR ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <GitPullRequest className="size-3.5" aria-hidden="true" />
                      )}
                      Create PR
                    </Button>
                  </div>
                </div>
              )}

              {/* PR exists - show status and actions */}
              {!isPRStatusLoading && prStatus?.pr && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
                  {/* PR Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitPullRequest className="size-4 text-zinc-400" aria-hidden="true" />
                      <span className="text-sm font-medium text-zinc-200">
                        PR #{prStatus.pr.number}
                      </span>
                      {prStatus.pr.state === "merged" && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          Merged
                        </Badge>
                      )}
                    </div>
                    <div className={cn("flex items-center gap-1", getChecksStatusDisplay(prStatus.pr.checks).className)}>
                      {getChecksStatusDisplay(prStatus.pr.checks).icon}
                      <span className="text-sm tabular-nums">
                        {getChecksStatusDisplay(prStatus.pr.checks).text}
                      </span>
                    </div>
                  </div>

                  {/* CI Checks (if any) */}
                  {prStatus.pr.checks.total > 0 && prStatus.pr.state !== "merged" && (
                    <div className="space-y-2">
                      <span className="text-xs text-zinc-500">Checks</span>
                      <div className="space-y-1.5">
                        {/* Show summary of checks */}
                        <div className="flex items-center gap-4 text-xs">
                          {prStatus.pr.checks.passed > 0 && (
                            <span className="flex items-center gap-1 text-green-400">
                              <Check className="size-3" aria-hidden="true" />
                              {prStatus.pr.checks.passed} passed
                            </span>
                          )}
                          {prStatus.pr.checks.failed > 0 && (
                            <span className="flex items-center gap-1 text-red-400">
                              <X className="size-3" aria-hidden="true" />
                              {prStatus.pr.checks.failed} failed
                            </span>
                          )}
                          {prStatus.pr.checks.pending > 0 && (
                            <span className="flex items-center gap-1 text-amber-400">
                              <Clock className="size-3" aria-hidden="true" />
                              {prStatus.pr.checks.pending} pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-2">
                    {/* View PR button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      asChild
                    >
                      <a
                        href={prStatus.pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        View PR
                      </a>
                    </Button>

                    {/* Merge PR button - only if checks passed and PR is open */}
                    {prStatus.pr.state === "open" &&
                      prStatus.pr.checks.status === "success" &&
                      prStatus.pr.mergeable && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-green-600/30 text-green-400 hover:bg-green-500/10"
                          onClick={handleMergePR}
                          disabled={isMergingPR}
                        >
                          {isMergingPR ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <GitMerge className="size-3.5" aria-hidden="true" />
                          )}
                          Merge PR
                        </Button>
                      )}

                    {/* Clean Up button - only if PR is merged */}
                    {prStatus.pr.state === "merged" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-zinc-600/30 text-zinc-400 hover:bg-zinc-500/10"
                        onClick={handleCleanUp}
                        disabled={isCleaningUp}
                      >
                        {isCleaningUp ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        )}
                        Clean Up
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {bead.description && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2 text-zinc-200">Description</h3>
              <div className="h-px bg-zinc-800 mb-3" />
              <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
                {bead.description}
              </div>
            </div>
          )}

          {/* Subtasks (for epics) */}
          {isEpic && onChildClick && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2 text-zinc-200">
                Subtasks ({childTasks.length})
              </h3>
              <div className="h-px bg-zinc-800 mb-3" />
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <SubtaskList
                  childTasks={childTasks}
                  onChildClick={onChildClick}
                  isExpanded={true}
                />
              </div>
            </div>
          )}

          {/* Design Document */}
          {hasDesignDoc && projectPath && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3 text-zinc-200">Design Document</h3>
              <DesignDocViewer
                designDocPath={bead.design_doc!}
                epicId={formatBeadId(bead.id)}
                projectPath={projectPath}
                onFullScreenChange={handleFullScreenChange}
              />
            </div>
          )}

          {/* Children slot for comments + timeline */}
          {children && <div className="mt-6">{children}</div>}
        </SheetContent>
      </Sheet>
    </>
  );
}
