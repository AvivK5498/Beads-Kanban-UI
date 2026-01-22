/**
 * Bead counts by status for a project
 */
export interface BeadCounts {
  open: number;
  in_progress: number;
  inreview: number;
  closed: number;
}

/**
 * Project stored in local SQLite
 */
export interface Project {
  id: string;
  name: string;
  path: string;
  tags: Tag[];
  lastOpened: string;
  createdAt: string;
  beadCounts?: BeadCounts;
}

/**
 * Tag stored in local SQLite
 */
export interface Tag {
  id: string;
  name: string;
  color: string;
}

/**
 * Bead status types
 */
export type BeadStatus = 'open' | 'in_progress' | 'inreview' | 'closed';

/**
 * Bead from .beads/issues.jsonl
 */
export interface Bead {
  id: string;
  title: string;
  description?: string;
  status: BeadStatus;
  priority: number;
  issue_type: string;
  owner: string;
  created_at: string;
  updated_at: string;
  comments: Comment[];
  // Epic support fields
  parent_id?: string;         // ID of parent epic (for child tasks)
  children?: string[];        // IDs of child tasks (for epics)
  design_doc?: string;        // Path like ".designs/{EPIC_ID}.md"
  deps?: string[];            // Dependency IDs (blocking this task)
  blockers?: string[];        // COMPUTED: Tasks this blocks (derived from deps relationships)
}

/**
 * Comment from .beads/issues.jsonl
 */
export interface Comment {
  id: number;
  issue_id: string;
  author: string;
  text: string;
  created_at: string;
}

/**
 * Kanban column configuration
 */
export interface KanbanColumn {
  id: BeadStatus;
  title: string;
  beads: Bead[];
}

/**
 * GitHub PR info (legacy - for backward compatibility)
 * @deprecated Use PRInfo from the PR Status Types section instead
 */
export interface LegacyPRInfo {
  url: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  statusCheckRollup: { state: 'SUCCESS' | 'FAILURE' | 'PENDING' } | null;
}

/**
 * Epic progress metrics (computed from children)
 */
export interface EpicProgress {
  total: number;       // Total number of child tasks
  completed: number;   // Number of children with status 'closed'
  inProgress: number;  // Number of children with status 'in_progress'
  blocked: number;     // Number of children with unresolved dependencies
}

/**
 * Epic-specific bead type
 */
export interface Epic extends Bead {
  issue_type: 'epic';
  children: string[];     // Epics always have children (required, not optional)
  progress?: EpicProgress; // Computed progress metrics
}

// ============================================================================
// Worktree Types
// ============================================================================

/**
 * Worktree status from GET /api/git/worktree-status
 */
export interface WorktreeStatus {
  /** Whether the worktree exists */
  exists: boolean;
  /** Path to the worktree (null if doesn't exist) */
  worktree_path: string | null;
  /** Branch name (null if doesn't exist) */
  branch: string | null;
  /** Number of commits ahead of main */
  ahead: number;
  /** Number of commits behind main */
  behind: number;
  /** Whether there are uncommitted changes */
  dirty: boolean;
  /** Last modification time of the worktree (ISO 8601 string) */
  last_modified: string | null;
}

/**
 * Worktree entry from GET /api/git/worktrees list
 */
export interface WorktreeEntry {
  /** Path to the worktree */
  path: string;
  /** Branch name */
  branch: string;
  /** Extracted bead ID (if matches bd-{ID} pattern) */
  bead_id?: string;
}

// ============================================================================
// PR Status Types
// ============================================================================

/**
 * CI checks status for a PR
 */
export interface PRChecks {
  /** Total number of checks */
  total: number;
  /** Number of passed checks */
  passed: number;
  /** Number of failed checks */
  failed: number;
  /** Number of pending checks */
  pending: number;
  /** Overall status */
  status: 'success' | 'failure' | 'pending';
}

/**
 * GitHub API rate limit information
 */
export interface RateLimit {
  /** Remaining API calls */
  remaining: number;
  /** Total limit */
  limit: number;
  /** Reset time (ISO 8601 string) */
  reset_at: string;
}

/**
 * PR state type
 */
export type PRState = 'open' | 'merged' | 'closed';

/**
 * PR information
 */
export interface PRInfo {
  /** PR number */
  number: number;
  /** PR URL */
  url: string;
  /** PR state */
  state: PRState;
  /** CI checks status */
  checks: PRChecks;
  /** Whether the PR is mergeable */
  mergeable: boolean;
}

/**
 * PR status response from GET /api/git/pr-status
 */
export interface PRStatus {
  /** Whether the repo has a remote */
  has_remote: boolean;
  /** Whether the branch has been pushed */
  branch_pushed: boolean;
  /** PR information (null if no PR exists) */
  pr: PRInfo | null;
  /** Rate limit information */
  rate_limit: RateLimit;
}
