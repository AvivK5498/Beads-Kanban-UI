"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  Calendar,
  GitPullRequest,
  ExternalLink,
  Check,
  X,
  Clock,
  GitMerge,
  Link2,
  Trash2,
  Loader2,
  Upload,
  TreePine,
  Code,
  RefreshCw,
  Layers,
  Square,
  Circle,
} from "lucide-react";

import { DesignDocViewer } from "@/components/design-doc-viewer";
import { PRFilesList } from "@/components/pr-files-list";
import { SubtaskList } from "@/components/subtask-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePRStatus } from "@/hooks/use-pr-status";
import { toast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import type { BranchStatus } from "@/lib/git";
import { cn } from "@/lib/utils";
import type { Bead, BeadStatus, WorktreeStatus, PRStatus, PRChecks, PRFilesResponse } from "@/types";


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
 * Get status dot color class based on status
 */
function getStatusDotColor(status: BeadStatus): string {
  switch (status) {
    case "open":
      return "text-zinc-400";
    case "in_progress":
      return "text-blue-400";
    case "inreview":
      return "text-purple-400";
    case "closed":
      return "text-green-400";
    default:
      return "text-zinc-400";
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
 * Format date for display with time (e.g., "Jan 22, 14:30" or "Jan 22, 2025, 14:30")
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const datePart = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return dateString;
  }
}

/**
 * Format date for short display (e.g., "Jan 23" or "Jan 23, 2025")
 */
function formatShortDate(dateString: string): string {
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
 * Shows only the worktree folder name (e.g., "bd-beads-kanban-ui-0io")
 */
function formatWorktreePath(path: string): string {
  const match = path.match(/\.worktrees\/(.+)$/);
  if (match) {
    return match[1];
  }
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
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
  const [isDesignDocFullScreen, setIsDesignDocFullScreen] = useState(false);
  const hasDesignDoc = !!bead.design_doc;

  // Action loading states
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [isMergingPR, setIsMergingPR] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isRebasingSiblings, setIsRebasingSiblings] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRefreshingPR, setIsRefreshingPR] = useState(false);

  // PR files state
  const [prFiles, setPrFiles] = useState<PRFilesResponse | null>(null);
  const [isPrFilesLoading, setIsPrFilesLoading] = useState(false);

  // Merge button delay state - wait for CI checks to load before showing merge button
  const [mergeButtonReady, setMergeButtonReady] = useState(false);
  const [isCheckingCI, setIsCheckingCI] = useState(false);

  // Guard to prevent duplicate auto-cleanup calls when PR is merged
  const autoCleanupTriggered = useRef(false);

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

  // Resolve related tasks from IDs (skip unknown IDs gracefully)
  const relatedTasks = useMemo(() => {
    if (!allBeads || !bead.relates_to || bead.relates_to.length === 0) return [];
    const beadMap = new Map(allBeads.map(b => [b.id, b]));
    return bead.relates_to
      .map(id => beadMap.get(id))
      .filter((b): b is Bead => b !== undefined);
  }, [bead.relates_to, allBeads]);

  // PR status for child tasks
  const [childPRStatuses, setChildPRStatuses] = useState<Map<string, { state: "open" | "merged" | "closed"; checks: { status: "success" | "failure" | "pending" } }>>(new Map());

  // Fetch PR status for all child tasks with auto-refresh
  const fetchChildPRStatuses = useCallback(async () => {
    if (!projectPath || childTasks.length === 0) return;

    const statusMap = new Map<string, { state: "open" | "merged" | "closed"; checks: { status: "success" | "failure" | "pending" } }>();

    // Fetch PR status for all children in parallel (skip closed - no PR needed)
    const results = await Promise.all(
      childTasks.filter(c => c.status !== 'closed').map(async (child) => {
        try {
          const prStatus = await api.git.prStatus(projectPath, child.id);
          if (prStatus.pr) {
            return {
              id: child.id,
              status: {
                state: prStatus.pr.state,
                checks: { status: prStatus.pr.checks.status },
              },
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

    setChildPRStatuses(statusMap);
  }, [projectPath, childTasks]);

  // Fetch PR status for all child tasks when epic detail is open, with 30s auto-refresh
  useEffect(() => {
    if (!open || !isEpic || !projectPath || childTasks.length === 0) {
      return;
    }

    // Initial fetch
    fetchChildPRStatuses();

    // Set up 30-second auto-refresh interval
    const intervalId = setInterval(() => {
      fetchChildPRStatuses();
    }, 30_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [open, isEpic, projectPath, childTasks, fetchChildPRStatuses]);

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

  // Clear action error and merge button state when panel closes
  useEffect(() => {
    if (!open) {
      setActionError(null);
      setMergeButtonReady(false);
      setIsCheckingCI(false);
    }
  }, [open]);

  // Delay showing merge button by 2 seconds when PR loads with open state
  // This allows CI checks to start before the user can merge
  const prState = prStatus?.pr?.state;
  const prNumber = prStatus?.pr?.number;
  useEffect(() => {
    // Only trigger when we have a PR that's open and loading has finished
    if (isPRStatusLoading || !prState || prState !== "open") {
      setMergeButtonReady(false);
      setIsCheckingCI(false);
      return;
    }

    // Start the 2 second delay
    setIsCheckingCI(true);
    setMergeButtonReady(false);

    const timer = setTimeout(async () => {
      // Re-fetch PR status to get updated checks
      await refreshPRStatus();
      setIsCheckingCI(false);
      setMergeButtonReady(true);
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [isPRStatusLoading, prState, prNumber, refreshPRStatus]);

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

        // Rebase sibling branches after successful merge
        setIsRebasingSiblings(true);
        try {
          const rebaseResult = await api.git.rebaseSiblings(projectPath, bead.id);
          const successCount = rebaseResult.results.filter(r => r.success).length;
          const failedResults = rebaseResult.results.filter(r => !r.success);

          if (rebaseResult.results.length === 0) {
            // No siblings to rebase - don't show toast
          } else if (failedResults.length === 0) {
            toast({
              title: "Branches rebased",
              description: `Successfully rebased ${successCount} sibling branch${successCount !== 1 ? "es" : ""} onto main.`,
            });
          } else {
            toast({
              variant: "destructive",
              title: "Some rebases failed",
              description: `${successCount} succeeded, ${failedResults.length} failed: ${failedResults.map(r => r.bead_id).join(", ")}`,
            });
          }
        } catch (rebaseErr) {
          // Log but don't block - rebase is a nice-to-have
          console.error("Failed to rebase siblings:", rebaseErr);
          toast({
            variant: "destructive",
            title: "Rebase failed",
            description: rebaseErr instanceof Error ? rebaseErr.message : "Failed to rebase sibling branches",
          });
        } finally {
          setIsRebasingSiblings(false);
        }
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
   * @param options.auto - When true, this was triggered automatically on PR merge detection
   */
  const handleCleanUp = useCallback(async (options?: { auto?: boolean }) => {
    if (!projectPath) return;

    setIsCleaningUp(true);
    setActionError(null);

    try {
      const result = await api.git.deleteWorktree(projectPath, bead.id);

      if (!result.success) {
        setActionError("Failed to delete worktree");
      } else {
        if (options?.auto) {
          toast({
            title: "PR merged",
            description: "Worktree cleaned up and bead closed automatically.",
          });
        }
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

  // Auto-cleanup when PR merge is detected and worktree still exists
  useEffect(() => {
    if (
      prStatus?.pr?.state === "merged" &&
      worktreeStatus?.exists &&
      !autoCleanupTriggered.current &&
      !isCleaningUp &&
      projectPath
    ) {
      autoCleanupTriggered.current = true;
      handleCleanUp({ auto: true });
    }
  }, [prStatus, worktreeStatus, isCleaningUp, projectPath, handleCleanUp]);

  // Reset auto-cleanup guard when the bead changes
  useEffect(() => {
    autoCleanupTriggered.current = false;
  }, [bead.id]);

  // Fetch PR files when PR exists and is open (not merged)
  useEffect(() => {
    if (!projectPath || !prStatus?.pr || prStatus.pr.state !== "open") {
      setPrFiles(null);
      return;
    }

    let cancelled = false;
    setIsPrFilesLoading(true);

    api.git.prFiles(projectPath, bead.id)
      .then((data) => {
        if (!cancelled) {
          setPrFiles(data);
        }
      })
      .catch(() => {
        // Silently ignore - the file list is supplementary info
        if (!cancelled) {
          setPrFiles(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPrFilesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath, bead.id, prStatus?.pr?.state, prStatus?.pr?.number]);

  /**
   * Open worktree in external application
   */
  const handleOpenExternal = useCallback(async (target: 'vscode' | 'cursor' | 'finder') => {
    if (!worktreeStatus?.worktree_path) return;

    try {
      await api.fs.openExternal(worktreeStatus.worktree_path, target);
    } catch (err) {
      console.error("Failed to open:", err);
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

            {/* Worktree path - below title, only if worktree exists */}
            {bead.issue_type !== "epic" && hasWorktree && worktreeStatus?.worktree_path && (
              <div className={cn(
                "font-mono text-xs text-zinc-500",
                bead.status === "closed" && "opacity-40"
              )}>
                {formatWorktreePath(worktreeStatus.worktree_path)}
              </div>
            )}
          </SheetHeader>

          {/* Inline Metadata Row */}
          <div className="mt-6 flex justify-center items-center gap-3 text-sm text-zinc-400">
            {/* Type with icon */}
            <span className="flex items-center gap-1.5">
              {bead.issue_type === "epic" ? (
                <Layers className="size-3.5" aria-hidden="true" />
              ) : (
                <Square className="size-3.5" aria-hidden="true" />
              )}
              <span className="capitalize">{bead.issue_type}</span>
            </span>

            <span className="text-zinc-600" aria-hidden="true">•</span>

            {/* Status with colored dot */}
            <span className="flex items-center gap-1.5">
              <Circle className={cn("size-2 fill-current", getStatusDotColor(bead.status))} aria-hidden="true" />
              <span>{formatStatus(bead.status)}</span>
            </span>

            <span className="text-zinc-600" aria-hidden="true">•</span>

            {/* Date with calendar icon */}
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5" aria-hidden="true" />
              <span>{formatShortDate(bead.created_at)}</span>
            </span>
          </div>

          {/* Worktree & PR Section */}
          {hasWorktree && projectPath && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-200">Worktree & PR</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  mode="icon"
                  className="h-6 w-6 -mr-1"
                  onClick={async () => {
                    setIsRefreshingPR(true);
                    try {
                      await refreshPRStatus();
                    } finally {
                      setIsRefreshingPR(false);
                    }
                  }}
                  disabled={isPRStatusLoading || isRefreshingPR}
                  aria-label="Refresh PR status"
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      (isPRStatusLoading || isRefreshingPR) && "animate-spin"
                    )}
                  />
                </Button>
              </div>
              <div className="h-px bg-zinc-800 mb-3" />

              {/* Loading state */}
              {isPRStatusLoading && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-4 rounded" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-4 w-10" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              )}

              {/* Error state */}
              {actionError && (
                <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
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
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={handleCreatePR}
                              disabled={isCreatingPR || bead.status !== "inreview"}
                            >
                              {isCreatingPR ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <GitPullRequest className="size-3.5" aria-hidden="true" />
                              )}
                              Create PR
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {bead.status !== "inreview" && (
                          <TooltipContent>
                            Bead must be in review to create a PR
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
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

                  {/* PR Files Changed */}
                  {prStatus.pr.state === "open" && isPrFilesLoading && (
                    <div className="space-y-2">
                      <Skeleton className="h-3.5 w-28" />
                      <div className="space-y-1">
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-3/4" />
                      </div>
                    </div>
                  )}
                  {prStatus.pr.state === "open" && prFiles && prFiles.files.length > 0 && (
                    <PRFilesList
                      files={prFiles.files}
                      totalAdditions={prFiles.total_additions}
                      totalDeletions={prFiles.total_deletions}
                      totalFiles={prFiles.total_files}
                    />
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

                    {/* Merge conflicts alert */}
                    {prStatus.pr.state === "open" && !prStatus.pr.mergeable && (
                      <span className="flex items-center gap-1.5 text-xs text-red-400">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        Merge conflicts
                      </span>
                    )}

                    {/* Checking CI status indicator - shown during 2s delay */}
                    {prStatus.pr.state === "open" && isCheckingCI && (
                      <span
                        role="status"
                        aria-live="polite"
                        className="flex items-center gap-1.5 text-xs text-zinc-500"
                      >
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        Checking CI status…
                      </span>
                    )}

                    {/* Merge PR button - only if checks passed, PR is open, and delay has passed */}
                    {prStatus.pr.state === "open" &&
                      mergeButtonReady &&
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
                        onClick={() => handleCleanUp()}
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

                  {/* Rebase progress indicator */}
                  {isRebasingSiblings && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-center gap-2 pt-2 text-xs text-zinc-400"
                    >
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      <span>Rebasing other branches...</span>
                    </div>
                  )}
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

          {/* Related Tasks */}
          {relatedTasks.length > 0 && onChildClick && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2 text-zinc-200 flex items-center gap-1.5">
                <Link2 className="size-3.5" aria-hidden="true" />
                Related Tasks ({relatedTasks.length})
              </h3>
              <div className="h-px bg-zinc-800 mb-3" />
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="space-y-1">
                  {relatedTasks.map((related) => (
                    <button
                      key={related.id}
                      onClick={() => onChildClick(related)}
                      aria-label={`Open related task: ${related.title}`}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md",
                        "hover:bg-zinc-800 transition-colors text-left",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400",
                        "group"
                      )}
                    >
                      <Circle
                        className={cn("size-2 flex-shrink-0 fill-current", getStatusDotColor(related.status))}
                        aria-hidden="true"
                      />
                      <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">
                        {formatBeadId(related.id)}
                      </span>
                      <span className={cn(
                        "text-xs font-medium flex-1 min-w-0 truncate group-hover:underline",
                        related.status === "closed" ? "line-through text-zinc-500" : "text-zinc-200"
                      )}>
                        {related.title}
                      </span>
                      <Badge
                        variant="outline"
                        size="xs"
                        className="flex-shrink-0"
                      >
                        {formatStatus(related.status)}
                      </Badge>
                    </button>
                  ))}
                </div>
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
                  childPRStatuses={childPRStatuses}
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
