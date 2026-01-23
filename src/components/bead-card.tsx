"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Bead, WorktreeStatus, PRStatus } from "@/types";
import type { BranchStatus } from "@/lib/git";
import { FolderOpen, GitPullRequest, MessageSquare, Check, X, Clock } from "lucide-react";

export interface BeadCardProps {
  bead: Bead;
  ticketNumber?: number;
  /** @deprecated Use worktreeStatus instead */
  branchStatus?: BranchStatus;
  /** Worktree status for the bead */
  worktreeStatus?: WorktreeStatus;
  /** Mini PR status for card display */
  prStatus?: PRStatus;
  isSelected?: boolean;
  onSelect: (bead: Bead) => void;
}

/**
 * Get worktree status color for the status box
 * Green: PR merged or checks passed
 * Yellow/amber: checks pending
 * Red: checks failed or needs rebase
 * Gray: no PR or default state
 */
function getWorktreeStatusColor(worktreeStatus?: WorktreeStatus, prStatus?: PRStatus): string {
  if (!worktreeStatus?.exists) {
    return "bg-zinc-800/50 border-zinc-700/50";
  }

  // Check PR status first
  if (prStatus?.pr) {
    const { state, checks } = prStatus.pr;

    if (state === "merged") {
      return "bg-green-500/10 border-green-600/30";
    }

    if (checks.status === "success") {
      return "bg-green-500/10 border-green-600/30";
    }

    if (checks.status === "pending") {
      return "bg-amber-500/10 border-amber-600/30";
    }

    if (checks.status === "failure") {
      return "bg-red-500/10 border-red-600/30";
    }
  }

  // Check worktree ahead/behind
  const { ahead, behind } = worktreeStatus;

  if (ahead > 0 && behind > 0) {
    // Needs rebase - red
    return "bg-red-500/10 border-red-600/30";
  }

  if (ahead > 0 && behind === 0) {
    // Ready to push/PR - green
    return "bg-green-500/10 border-green-600/30";
  }

  return "bg-zinc-800/50 border-zinc-700/50";
}

/**
 * Get the PR checks display icon and text
 */
function getPRChecksDisplay(prStatus: PRStatus): { icon: React.ReactNode; text: string; className: string } {
  const { pr } = prStatus;

  if (!pr) {
    return { icon: null, text: "", className: "" };
  }

  if (pr.state === "merged") {
    return {
      icon: <Check className="size-3" aria-hidden="true" />,
      text: "Merged",
      className: "text-green-400"
    };
  }

  const { checks } = pr;
  const checksText = `${checks.passed}/${checks.total}`;

  if (checks.status === "success") {
    return {
      icon: <Check className="size-3" aria-hidden="true" />,
      text: checksText,
      className: "text-green-400"
    };
  }

  if (checks.status === "pending") {
    return {
      icon: <Clock className="size-3" aria-hidden="true" />,
      text: checksText,
      className: "text-amber-400"
    };
  }

  if (checks.status === "failure") {
    return {
      icon: <X className="size-3" aria-hidden="true" />,
      text: checksText,
      className: "text-red-400"
    };
  }

  return { icon: null, text: checksText, className: "text-zinc-400" };
}

/**
 * Format worktree path for display (shorten if needed)
 */
function formatWorktreePath(path: string): string {
  // Extract the relative part after .worktrees/
  const match = path.match(/\.worktrees\/(.+)$/);
  if (match) {
    return `.worktrees/${match[1]}`;
  }
  // Fallback: show last two path segments
  const parts = path.split("/");
  if (parts.length >= 2) {
    return parts.slice(-2).join("/");
  }
  return path;
}

/**
 * Detect if bead is blocked by checking for unresolved dependencies
 * A task is blocked only if it has unresolved dependencies
 * Closed tasks are never blocked (they've completed)
 * Note: The deps field only contains UNRESOLVED dependencies (backend filters out closed deps)
 */
function isBlocked(bead: Bead): boolean {
  // Closed tasks are never blocked (they've completed)
  if (bead.status === 'closed') return false;
  // A task is blocked if it has unresolved dependencies
  return (bead.deps ?? []).length > 0;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

/**
 * Format bead ID for display (short form)
 */
function formatBeadId(id: string): string {
  // If ID is like "project-abc123", show "BD-abc123"
  // If already has BD prefix, show as-is but truncate if needed
  if (id.startsWith("BD-") || id.startsWith("bd-")) {
    return id.length > 10 ? `BD-${id.slice(-6)}` : id.toUpperCase();
  }
  // Extract last part after dash
  const parts = id.split("-");
  const shortId = parts[parts.length - 1];
  return `BD-${shortId.slice(0, 6)}`;
}

/**
 * Get the display label for the bead type
 */
function getTypeLabel(bead: Bead): string {
  return bead.issue_type === "epic" ? "Epic" : "Task";
}

export function BeadCard({ bead, ticketNumber, branchStatus, worktreeStatus, prStatus, isSelected = false, onSelect }: BeadCardProps) {
  const blocked = isBlocked(bead);
  const commentCount = (bead.comments ?? []).length;

  // Prefer worktree status over branch status
  const hasWorktree = worktreeStatus?.exists ?? false;
  const hasPR = prStatus?.pr !== null && prStatus?.pr !== undefined;

  // Fallback to legacy branch status if no worktree status provided
  const branchExists = branchStatus?.exists ?? false;
  const showLegacyBranch = !worktreeStatus && branchExists;

  // Get PR checks display info
  const prChecksDisplay = prStatus ? getPRChecksDisplay(prStatus) : null;

  return (
    <Card
      data-bead-id={bead.id}
      role="button"
      tabIndex={0}
      aria-label={`Select bead: ${bead.title}`}
      className={cn(
        // Outline variant: no shadow, subtle border
        "cursor-pointer border-border/40 shadow-none",
        "bg-card",
        "transition-[transform,border-color] duration-200",
        "hover:-translate-y-0.5 hover:border-border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        // Blocked indicator
        blocked && "border-l-4 border-l-red-500",
        // Selected state
        isSelected && "ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}
      onClick={() => onSelect(bead)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(bead);
        }
      }}
    >
      <CardHeader className="p-3 space-y-1.5">
        {/* Row 1: ID (left) + Type Badge (right) */}
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-mono">
            {ticketNumber !== undefined && (
              <span className="font-semibold text-foreground">#{ticketNumber}</span>
            )}
            {ticketNumber !== undefined && " "}
            {formatBeadId(bead.id)}
          </CardDescription>
          <div className="flex items-center gap-1.5">
            {blocked && (
              <Badge
                variant="destructive"
                appearance="light"
                size="xs"
              >
                BLOCKED
              </Badge>
            )}
            <Badge
              variant="outline"
              size="xs"
            >
              {getTypeLabel(bead)}
            </Badge>
          </div>
        </div>

        {/* Row 2: Title */}
        <CardTitle className="font-semibold text-sm leading-tight">
          {truncate(bead.title, 60)}
        </CardTitle>

        {/* Description (truncated, muted) */}
        {bead.description && (
          <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
            {truncate(bead.description, 80)}
          </p>
        )}
      </CardHeader>

      {/* Worktree and PR status box */}
      {hasWorktree && worktreeStatus?.worktree_path && (
        <div className="px-3 pb-3">
          <div
            className={cn(
              "rounded-md border p-2 space-y-1.5",
              getWorktreeStatusColor(worktreeStatus, prStatus)
            )}
          >
            {/* Worktree path row */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <FolderOpen className="size-3 shrink-0" aria-hidden="true" />
              <span className="font-mono truncate">
                {formatWorktreePath(worktreeStatus.worktree_path)}
              </span>
            </div>

            {/* PR status row (if PR exists) */}
            {hasPR && prStatus?.pr && prChecksDisplay && (
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 text-foreground">
                  <GitPullRequest className="size-3 shrink-0" aria-hidden="true" />
                  <span>PR #{prStatus.pr.number}</span>
                </div>
                <div className={cn("flex items-center gap-1", prChecksDisplay.className)}>
                  {prChecksDisplay.icon}
                  <span className="tabular-nums">{prChecksDisplay.text}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legacy branch badge (fallback when no worktree status) */}
      {showLegacyBranch && branchStatus && (
        <div className="px-3 pb-3">
          <Badge
            variant="outline"
            size="sm"
            className={getLegacyBranchBadgeColor(branchStatus)}
          >
            <FolderOpen className="size-3 mr-1" aria-hidden="true" />
            {getLegacyBranchStatusLabel(branchStatus)}
          </Badge>
        </div>
      )}

      {/* Footer: comment count */}
      {commentCount > 0 && (
        <CardFooter className="p-3 pt-0 gap-2 text-muted-foreground">
          <span className="flex items-center gap-1 text-[10px]">
            <MessageSquare className="size-3" aria-hidden="true" />
            {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * Legacy: Get branch badge color based on ahead/behind status
 * @deprecated Used only for backward compatibility when worktreeStatus is not provided
 */
function getLegacyBranchBadgeColor(status: BranchStatus): string {
  const { ahead, behind } = status;

  if (ahead > 0 && behind > 0) {
    return "bg-red-500/10 text-red-400 border-red-600/30";
  } else if (ahead > 0 && behind === 0) {
    return "bg-green-500/10 text-green-400 border-green-600/30";
  } else if (ahead === 0 && behind > 0) {
    return "bg-zinc-500/10 text-zinc-400 border-zinc-600/30";
  } else {
    return "bg-green-500/10 text-green-400 border-green-600/30";
  }
}

/**
 * Legacy: Get human-readable label for branch status
 * @deprecated Used only for backward compatibility when worktreeStatus is not provided
 */
function getLegacyBranchStatusLabel(status: BranchStatus): string {
  const { ahead, behind } = status;

  if (ahead > 0 && behind > 0) {
    return "Needs rebase";
  } else if (ahead > 0 && behind === 0) {
    return "Ready to merge";
  } else if (ahead === 0 && behind > 0) {
    return "Merged";
  }
  return "Synced";
}
