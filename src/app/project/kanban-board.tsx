"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { QuickFilterBar } from "@/components/quick-filter-bar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { KanbanColumn } from "@/components/kanban-column";
import { BeadDetail } from "@/components/bead-detail";
import { CommentList } from "@/components/comment-list";
import { ActivityTimeline } from "@/components/activity-timeline";
import { EditableProjectName } from "@/components/editable-project-name";
import { MemoryPanel } from "@/components/memory-panel";
import { useBeads } from "@/hooks/use-beads";
import { useProject } from "@/hooks/use-project";
import { useBeadFilters } from "@/hooks/use-bead-filters";
import { useGitHubStatus } from "@/hooks/use-github-status";
/**
 * @deprecated useBranchStatuses is deprecated. Use useWorktreeStatuses instead.
 * TODO: Migrate to useWorktreeStatuses for the worktree-based workflow.
 */
import { useBranchStatuses } from "@/hooks/use-branch-statuses";
import { useWorktreeStatuses } from "@/hooks/use-worktree-statuses";
import { useKeyboardNavigation } from "@/hooks/use-keyboard-navigation";
import type { Bead, BeadStatus } from "@/types";

/**
 * Column configuration for the Kanban board
 * Note: Cancelled status is hidden per requirements
 */
const COLUMNS: { status: BeadStatus; title: string }[] = [
  { status: "open", title: "Open" },
  { status: "in_progress", title: "In Progress" },
  { status: "inreview", title: "In Review" },
  { status: "closed", title: "Closed" },
];

/**
 * Issue type filter options
 */
type IssueTypeFilter = "all" | "epics" | "tasks";

/**
 * Main Kanban board component with 4 columns, search, filter, and keyboard navigation
 */
export default function KanbanBoard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('id');

  // Fetch project data from SQLite
  const {
    project,
    isLoading: projectLoading,
    error: projectError,
    refetch: refetchProject,
  } = useProject(projectId);

  // Fetch beads from project path
  const {
    beads,
    ticketNumbers,
    isLoading: beadsLoading,
    error: beadsError,
    refresh: refreshBeads,
  } = useBeads(project?.path ?? "");

  // Use the bead filters hook with 300ms debounce
  const {
    filters,
    setFilters,
    filteredBeads,
    clearFilters,
    hasActiveFilters,
    availableOwners,
  } = useBeadFilters(beads, ticketNumbers, 300);

  // Issue type filter state (epics vs tasks)
  const [typeFilter, setTypeFilter] = useState<IssueTypeFilter>("all");

  // GitHub status check
  const { hasRemote, isAuthenticated, isLoading: githubStatusLoading } = useGitHubStatus(
    project?.path ?? null
  );

  // Track whether the GitHub warning has been dismissed (session-only)
  const [githubWarningDismissed, setGithubWarningDismissed] = useState(false);

  // Memory panel state
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);

  // Show GitHub warning if project loaded, status checked, and either no remote or not authenticated
  const showGitHubWarning = !projectLoading &&
    !githubStatusLoading &&
    project !== null &&
    !githubWarningDismissed &&
    (!hasRemote || !isAuthenticated);

  /**
   * Toggle a status in the filter
   */
  const toggleStatus = useCallback((status: BeadStatus) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter(s => s !== status)
      : [...filters.statuses, status];
    setFilters({ statuses: newStatuses });
  }, [filters.statuses, setFilters]);

  /**
   * Toggle an owner in the filter
   */
  const toggleOwner = useCallback((owner: string) => {
    const newOwners = filters.owners.includes(owner)
      ? filters.owners.filter(o => o !== owner)
      : [...filters.owners, owner];
    setFilters({ owners: newOwners });
  }, [filters.owners, setFilters]);

  // @deprecated: Branch statuses are deprecated. TODO: migrate to useWorktreeStatuses
  // Fetch branch statuses for all beads (legacy - for backward compatibility)
  // Filter out closed beads to avoid unnecessary polling for finalized tasks
  const beadIds = useMemo(() => beads.filter(b => b.status !== 'closed').map(b => b.id), [beads]);
  const { statuses: branchStatuses } = useBranchStatuses(
    project?.path ?? "",
    beadIds
  );

  // Worktree statuses for PR workflow
  const { statuses: worktreeStatuses } = useWorktreeStatuses(
    project?.path ?? "",
    beadIds
  );

  /**
   * Filter to only top-level beads (no parent_id)
   * Then apply issue type filter (epics vs tasks)
   * Child tasks should not appear in columns - they appear inside epic cards
   */
  const topLevelBeads = useMemo(() => {
    const topLevel = filteredBeads.filter(b => !b.parent_id);

    // Apply issue type filter
    if (typeFilter === "all") return topLevel;
    if (typeFilter === "epics") return topLevel.filter(b => b.issue_type === "epic");
    if (typeFilter === "tasks") return topLevel.filter(b => b.issue_type !== "epic");

    return topLevel;
  }, [filteredBeads, typeFilter]);

  /**
   * Group top-level beads by status for columns
   */
  const filteredBeadsByStatus = useMemo(() => {
    const grouped: Record<BeadStatus, Bead[]> = {
      open: [],
      in_progress: [],
      inreview: [],
      closed: [],
    };
    topLevelBeads.forEach((bead) => {
      grouped[bead.status].push(bead);
    });
    return grouped;
  }, [topLevelBeads]);

  // Detail sheet state
  const [detailBeadId, setDetailBeadId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Get the actual bead from the current beads array to ensure fresh data
  const detailBead = useMemo(() => {
    if (!detailBeadId) return null;
    return beads.find((b) => b.id === detailBeadId) || null;
  }, [detailBeadId, beads]);

  // Ref for search input (keyboard navigation)
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation (use top-level beads for navigation)
  const { selectedId } = useKeyboardNavigation({
    beads: topLevelBeads,
    beadsByStatus: filteredBeadsByStatus,
    selectedId: null,
    onSelect: () => {
      // Just highlight, don't open detail
    },
    onOpen: (bead) => {
      setDetailBeadId(bead.id);
      setIsDetailOpen(true);
    },
    onClose: () => {
      setIsDetailOpen(false);
    },
    searchInputRef,
    isDetailOpen,
  });

  // Redirect if no project ID
  useEffect(() => {
    if (!projectId) {
      router.replace("/");
    }
  }, [projectId, router]);

  /**
   * Handle bead selection - opens detail panel
   * Works for both epics and standalone tasks
   */
  const handleSelectBead = (bead: Bead) => {
    setDetailBeadId(bead.id);
    setIsDetailOpen(true);
  };

  /**
   * Handle child task click from within an epic
   */
  const handleChildClick = (child: Bead) => {
    setDetailBeadId(child.id);
    setIsDetailOpen(true);
  };

  /**
   * Handle navigation to a dependency from DependencyBadge
   */
  const handleNavigateToDependency = (beadId: string) => {
    setDetailBeadId(beadId);
    setIsDetailOpen(true);
  };

  /**
   * Handle navigation from Memory panel to a bead
   * Closes the memory panel and opens the bead detail
   */
  const handleMemoryNavigateToBead = useCallback((beadId: string) => {
    setIsMemoryOpen(false);
    // Find the bead - it may be a child task with a dot ID
    const found = beads.find((b) => b.id === beadId);
    if (found) {
      setDetailBeadId(found.id);
      setIsDetailOpen(true);
    }
  }, [beads]);

  // Redirect state while no project ID
  if (!projectId) {
    return (
      <div className="dark flex min-h-dvh items-center justify-center bg-[#0a0a0a]">
        <p className="text-zinc-500">Redirecting…</p>
      </div>
    );
  }

  // Show loading state
  if (projectLoading) {
    return (
      <div className="dark flex items-center justify-center min-h-dvh bg-[#0a0a0a]">
        <div role="status" className="text-zinc-500">Loading project…</div>
      </div>
    );
  }

  // Show project error state
  if (projectError) {
    return (
      <div className="dark flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] gap-4">
        <div role="alert" className="text-red-400">Error: {projectError.message}</div>
        <Button variant="outline" asChild>
          <Link href="/">Back to projects</Link>
        </Button>
      </div>
    );
  }

  // Project not found
  if (!project) {
    return (
      <div className="dark flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] gap-4">
        <div className="text-zinc-500">Project not found</div>
        <Button variant="outline" asChild>
          <Link href="/">Back to projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="dark min-h-dvh bg-[#0a0a0a] flex flex-col">
      {/* Breadcrumb line */}
      <div className="flex items-center gap-2 px-4 py-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to projects</span>
          </Link>
        </Button>
        <EditableProjectName
          projectId={project.id}
          initialName={project.name}
          onNameUpdated={refetchProject}
        />
      </div>

      {/* Quick Filter Bar */}
      <div className="flex justify-center px-4 pb-3">
        <QuickFilterBar
          // Search
          search={filters.search}
          onSearchChange={(value) => setFilters({ search: value })}
          searchInputRef={searchInputRef}
          // Type filter
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          // Today
          todayOnly={filters.todayOnly}
          onTodayOnlyChange={(value) => setFilters({ todayOnly: value })}
          // Sort
          sortField={filters.sortField}
          sortDirection={filters.sortDirection}
          onSortChange={(field, direction) => setFilters({ sortField: field, sortDirection: direction })}
          // Status/Owner filters
          statuses={filters.statuses}
          onStatusToggle={toggleStatus}
          owners={filters.owners}
          onOwnerToggle={toggleOwner}
          availableOwners={availableOwners}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          // Memory
          isMemoryOpen={isMemoryOpen}
          onMemoryToggle={() => setIsMemoryOpen((prev) => !prev)}
        />
      </div>

      {/* Kanban Columns */}
      <main className="flex-1 overflow-hidden p-4">
        {beadsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div role="status" className="text-zinc-500">Loading beads…</div>
          </div>
        ) : beadsError ? (
          <div className="flex items-center justify-center h-full">
            <div role="alert" className="text-red-400">Error loading beads: {beadsError.message}</div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4 h-full">
            {COLUMNS.map(({ status, title }) => (
              <KanbanColumn
                key={status}
                status={status}
                title={title}
                beads={filteredBeadsByStatus[status] || []}
                allBeads={beads}
                selectedBeadId={selectedId}
                ticketNumbers={ticketNumbers}
                branchStatuses={branchStatuses}
                onSelectBead={handleSelectBead}
                onChildClick={handleChildClick}
                onNavigateToDependency={handleNavigateToDependency}
                projectPath={project?.path}
                onUpdate={refreshBeads}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bead Detail Sheet */}
      {detailBead && (
        <BeadDetail
          bead={detailBead}
          ticketNumber={ticketNumbers.get(detailBead.id)}
          branchStatus={branchStatuses[detailBead.id]}
          worktreeStatus={worktreeStatuses[detailBead.id]}
          open={isDetailOpen}
          onOpenChange={(open) => {
            setIsDetailOpen(open);
            if (!open) {
              setDetailBeadId(null);
            }
          }}
          projectPath={project?.path ?? ""}
          allBeads={beads}
          onChildClick={handleChildClick}
        >
          <CommentList
            comments={detailBead.comments}
            beadId={detailBead.id}
            projectPath={project?.path ?? ""}
            onCommentAdded={refreshBeads}
          />
          <ActivityTimeline
            bead={detailBead}
            comments={detailBead.comments}
            childBeads={(detailBead.children || [])
              .map(id => beads.find(b => b.id === id))
              .filter((b): b is Bead => !!b)}
          />
        </BeadDetail>
      )}

      {/* Memory Panel */}
      {project?.path && (
        <MemoryPanel
          open={isMemoryOpen}
          onOpenChange={setIsMemoryOpen}
          projectPath={project.path}
          onNavigateToBead={handleMemoryNavigateToBead}
        />
      )}

      {/* GitHub Integration Warning Dialog */}
      <AlertDialog open={showGitHubWarning} onOpenChange={(open) => !open && setGithubWarningDismissed(true)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>GitHub Integration Unavailable</AlertDialogTitle>
            <AlertDialogDescription>
              {!hasRemote
                ? "This repository doesn't have a GitHub remote configured."
                : "GitHub CLI is not authenticated."}
              {" "}PR features (Create PR, Merge PR, status checks) will not be available.
              You can still work on tasks locally.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button>Continue Without GitHub</Button>} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
