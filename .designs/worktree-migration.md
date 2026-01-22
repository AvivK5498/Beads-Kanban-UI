# Worktree Migration Design

## Executive Summary

This design document outlines the migration from git branches to git worktrees for the beads-kanban-ui and beads-orchestration workflow, including support for remote repositories and PR-based workflows.

**Key Benefits:**
1. **Parallel work** - Multiple supervisors can work on different tasks without conflicts
2. **Orchestrator debugging** - Read files from any worktree without switching branches
3. **PR integration** - CI checks, code review, and merge via GitHub
4. **Automation** - Auto-close beads and cleanup worktrees when PRs merge

---

## Key Design Decisions

### 1. Epics Are Organizational Only

Epics exist only at the beads level - no git branch or worktree.

| Concept | Beads Level | Git Level |
|---------|-------------|-----------|
| Standalone task | `BD-001` | `.worktrees/bd-BD-001/` |
| Epic | `EPIC-001` (parent) | (nothing) |
| Epic child | `EPIC-001.1` (child) | `.worktrees/bd-EPIC-001.1/` |

### 2. Orchestrator Does NOT Merge

| Role | Creates Worktree | Implements | Pushes | Creates PR | Merges |
|------|------------------|------------|--------|------------|--------|
| Supervisor | ✅ | ✅ | ✅ | ❌ | ❌ |
| Orchestrator | ❌ | ❌ | ❌ | ❌ | ❌ |
| UI/Human | ❌ | ❌ | ❌ | ✅ | ✅ |

**Merging happens via PR** (manually or via UI button), not by orchestrator.

### 3. Sequential Execution

| What | Enforced By |
|------|-------------|
| Dispatch order | `enforce-sequential-dispatch.sh` hook |
| Merge order | Dependency resolution (child 1 must merge before child 2 starts) |

---

## API Design

### Worktree Endpoints

#### GET /api/git/worktree-status

```json
// Request: ?repo_path={repo}&bead_id={id}

// Response:
{
  "exists": true,
  "worktree_path": "/repo/.worktrees/bd-BD-001",
  "branch": "bd-BD-001",
  "ahead": 5,
  "behind": 2,
  "dirty": false,
  "last_modified": "2024-01-22T10:30:00Z"
}
```

#### POST /api/git/worktree (Idempotent)

```json
// Request:
{
  "repo_path": "/path/to/repo",
  "bead_id": "BD-001",
  "base_branch": "main"
}

// Response:
{
  "success": true,
  "worktree_path": "/repo/.worktrees/bd-BD-001",
  "branch": "bd-BD-001",
  "already_existed": false  // true if worktree already existed
}
```

**Idempotency:** If worktree exists, returns existing path with `already_existed: true`. Handles agent crashes gracefully.

#### DELETE /api/git/worktree

```json
// Request:
{ "repo_path": "/path/to/repo", "bead_id": "BD-001" }

// Response:
{ "success": true }
```

#### GET /api/git/worktrees

```json
// Request: ?repo_path={repo}

// Response:
{
  "worktrees": [
    { "path": "/repo/.worktrees/bd-BD-001", "branch": "bd-BD-001", "bead_id": "BD-001" }
  ]
}
```

### PR Status Endpoint (New)

#### GET /api/git/pr-status

```json
// Request: ?repo_path={repo}&bead_id={id}

// Response:
{
  "has_remote": true,
  "branch_pushed": true,
  "pr": {
    "number": 142,
    "url": "https://github.com/user/repo/pull/142",
    "state": "open",  // "open", "merged", "closed"
    "checks": {
      "total": 3,
      "passed": 2,
      "failed": 0,
      "pending": 1,
      "status": "pending"  // "success", "failure", "pending"
    },
    "mergeable": true
  },
  "rate_limit": {
    "remaining": 4823,
    "limit": 5000,
    "reset_at": "2024-01-22T15:00:00Z"
  }
}
```

#### POST /api/git/create-pr

```json
// Request:
{
  "repo_path": "/path/to/repo",
  "bead_id": "BD-001",
  "title": "Fix: Branch badge readability",
  "body": "Closes BD-001\n\n..."
}

// Response:
{
  "success": true,
  "pr_number": 142,
  "pr_url": "https://github.com/..."
}
```

#### POST /api/git/merge-pr

```json
// Request:
{
  "repo_path": "/path/to/repo",
  "bead_id": "BD-001",
  "merge_method": "squash"  // "merge", "squash", "rebase"
}

// Response:
{
  "success": true,
  "merged": true
}
```

---

## Worktree Strategy

### Directory Structure

```
/path/to/repo/                    # Main directory (always on main, always clean)
  .worktrees/
    bd-BD-001/                    # Standalone task
    bd-EPIC-001.1/                # Epic child 1
    bd-EPIC-001.2/                # Epic child 2
```

### Lifecycle

| Event | Actor | Action |
|-------|-------|--------|
| Task created | Supervisor | `git worktree add .worktrees/bd-{ID} -b bd-{ID} main` |
| Work complete | Supervisor | `git push origin bd-{ID}`, mark `inreview` |
| PR created | UI button | `gh pr create` |
| CI passes | GitHub | Checks complete |
| PR merged | Human/UI | `gh pr merge` or GitHub UI |
| Cleanup | Session-start hook | `git worktree remove`, `bd close` |

### Dirty Parent Prevention

Main directory must stay pristine. Session-start hook warns if dirty:

```bash
# In session-start.sh
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -n "$REPO_ROOT" ]]; then
    DIRTY=$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)
    if [[ -n "$DIRTY" ]]; then
        echo "⚠️  WARNING: Main directory has uncommitted changes."
        echo "   Agents should only work in .worktrees/"
    fi
fi
```

---

## Remote/PR Workflow

### UI Flow

```
Task completes (inreview)
         │
         ▼
┌─────────────────────────────────────┐
│ Has remote? ──No──► Show worktree   │
│      │              status only     │
│     Yes                             │
│      │                              │
│      ▼                              │
│ Branch pushed? ──No──► "Push Branch"│
│      │                   button     │
│     Yes                             │
│      │                              │
│      ▼                              │
│ PR exists? ──No──► "Create PR"      │
│      │              button          │
│     Yes                             │
│      │                              │
│      ▼                              │
│ ┌─────────────────────────────────┐ │
│ │ PR #142              ✓ 3/3     │ │
│ │ [View PR] [Merge PR]           │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### PR Status Display

**Checks pending:**
```
│ PR #142                    ⏳ 1/3 │
│ [View PR]                        │
```

**Checks passed:**
```
│ PR #142                    ✓ 3/3 │
│ [View PR] [Merge PR]             │
```

**Checks failed:**
```
│ PR #142                    ✗ 2/3 │
│ [View PR]                        │
```

**PR merged:**
```
│ PR #142                  Merged ✓│
│ [View PR] [Clean Up]             │
```

### Merge Options

| Option | Description | When to Use |
|--------|-------------|-------------|
| Manual (GitHub) | User clicks "View PR" → merges on GitHub | Code review required |
| UI Merge | "Merge PR" button → `gh pr merge` | Trusted CI, no review |
| Auto-merge | PR created with `gh pr merge --auto` | Full automation |

---

## Polling & Sync Strategy

### Polling Configuration

```json
// In project or global settings
{
  "pr_polling": {
    "enabled": true,
    "interval_seconds": 30,    // Default: 30s
    "min_interval": 10,        // Minimum allowed
    "max_interval": 300        // Maximum allowed
  }
}
```

### Polling Behavior

| Trigger | Action |
|---------|--------|
| Background (every N seconds) | Poll PR status for ALL beads with worktrees |
| Click/interact with bead | Immediate fetch for that bead |
| Manual refresh button | Fetch all |

### Rate Limit Handling

```typescript
// Check rate limit before polling
const status = await api.git.prStatus(repoPath, beadId);

if (status.rate_limit.remaining < 100) {
  showWarning("GitHub API rate limit low");
  // Optionally slow down polling
}

if (status.rate_limit.remaining < 10) {
  showError("GitHub API rate limit exhausted");
  pausePolling();
}
```

### Sync Layers

| Layer | Mechanism | What It Syncs |
|-------|-----------|---------------|
| Real-time | SSE file watcher | `.beads/issues.jsonl` changes |
| Polling | HTTP every 30s | Worktree status, PR status, CI checks |
| On-demand | User interaction | Immediate refresh for clicked bead |
| Session-start | Hook | Detect merged PRs, auto-cleanup |

---

## Automation

### Auto-Cleanup on PR Merge

**Session-start hook:**
```bash
# Detect merged PRs and cleanup
for worktree in $(git worktree list --porcelain | grep "worktree.*\.worktrees/bd-" | awk '{print $2}'); do
    BEAD_ID=$(basename "$worktree" | sed 's/bd-//')
    BRANCH=$(basename "$worktree")
    
    # Check if branch was merged to main
    if git branch --merged main | grep -q "$BRANCH"; then
        echo "✓ $BRANCH was merged - cleaning up"
        git worktree remove "$worktree" 2>/dev/null
        bd close "$BEAD_ID" 2>/dev/null
    fi
done
```

**UI "Clean Up" button:**
After PR shows as merged, user can click to remove worktree and close bead.

### Open PR Reminder Hook

```bash
# In session-start.sh - remind user of open PRs
OPEN_PRS=$(gh pr list --author "@me" --state open --json number,title,headRefName 2>/dev/null)
if [[ -n "$OPEN_PRS" && "$OPEN_PRS" != "[]" ]]; then
    echo "📋 You have open PRs:"
    echo "$OPEN_PRS" | jq -r '.[] | "  #\(.number) \(.title) (\(.headRefName))"'
fi
```

---

## Workflows

### Standalone Task (with Remote)

```
Orchestrator                           Supervisor
────────────                           ──────────
1. Investigate issue
2. bd create "Fix bug"
3. Task(supervisor, "BEAD_ID: BD-001...")
                                       4. Create worktree (idempotent API)
                                       5. cd .worktrees/bd-BD-001
                                       6. bd update BD-001 --status in_progress
                                       7. Implement fix
                                       8. git add && git commit
                                       9. git push origin bd-BD-001
                                       10. bd update BD-001 --status inreview
                                       11. Exit with completion report

12. Review (Read files from worktree)
                                       
User (via UI)
─────────────
13. Click "Create PR" button
14. Wait for CI checks (UI polls)
15. Click "Merge PR" when checks pass
16. Click "Clean Up" (or session-start auto-cleans)
```

### Epic with Children

```
Orchestrator
────────────
1. bd create "Feature" --type epic → EPIC-001
2. bd create "DB schema" --parent EPIC-001 → EPIC-001.1
3. bd create "API" --parent EPIC-001 --deps EPIC-001.1 → EPIC-001.2
4. bd create "Frontend" --parent EPIC-001 --deps EPIC-001.2 → EPIC-001.3

5. Dispatch EPIC-001.1 (no blockers)
   → Supervisor creates worktree, implements, pushes, marks inreview

User (via UI)
─────────────
6. Create PR for EPIC-001.1
7. Wait for CI, merge PR
8. Clean up worktree

Orchestrator
────────────
9. Dispatch EPIC-001.2 (blocker resolved - .1 is merged)
   → Starts from main which now has .1's changes

... repeat for each child ...

10. bd close EPIC-001
```

---

## Hook Changes

### DELETE: `block-branch-for-epic-child.sh`
No longer needed - children get own worktrees.

### MODIFY: `enforce-branch-before-edit.sh`
Block if NOT in `.worktrees/` AND on main branch.

### MODIFY: `validate-completion.sh`
Check for `Worktree:` instead of `Branch:`.

### MODIFY: `session-start.sh`
- Dirty parent check
- Merged PR auto-cleanup
- Open PR reminder

### KEEP: `enforce-sequential-dispatch.sh`
Still needed for dispatch order.

---

## Agent Configuration

### Supervisor Phase 0

```markdown
1. Create worktree (idempotent):
   REPO_ROOT=$(git rev-parse --show-toplevel)
   curl -X POST http://localhost:3008/api/git/worktree \
     -d '{"repo_path": "'$REPO_ROOT'", "bead_id": "{BEAD_ID}"}'
   cd "$REPO_ROOT/.worktrees/bd-{BEAD_ID}"

2. Mark in progress:
   bd update {BEAD_ID} --status in_progress
```

### Supervisor Completion

```markdown
1. Commit changes:
   git add -A && git commit -m "..."

2. Push branch:
   git push origin bd-{BEAD_ID}

3. Mark inreview:
   bd update {BEAD_ID} --status inreview

4. Completion report:
   BEAD {BEAD_ID} COMPLETE
   Worktree: .worktrees/bd-{BEAD_ID}
   Files: [list]
   Tests: pass
   Summary: [1 sentence]
```

---

## UI Changes

### Bead Card (Kanban)

```
┌─────────────────────────────────────┐
│ #73  BD-IYU                    Task │
│ Fix branch badge readability        │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📁 .worktrees/bd-BD-IYU        │ │
│ │ PR #142                  ✓ 3/3 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Bead Detail Panel

```
┌─────────────────────────────────────┐
│ ← Back                          ✕   │
│                                     │
│ #73  BD-IYU                         │
│ Fix branch badge readability        │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Status          │ Priority      │ │
│ │ In Review       │ P2            │ │
│ │                 │               │ │
│ │ Type            │ Worktree      │ │
│ │ Task            │ .worktrees/   │ │
│ │                 │ bd-BD-IYU     │ │
│ │                 │ [Open in IDE] │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Pull Request                        │
│ ┌─────────────────────────────────┐ │
│ │ PR #142                  ✓ 3/3 │ │
│ │                                 │ │
│ │ Checks:                         │ │
│ │   ✓ build        passed         │ │
│ │   ✓ lint         passed         │ │
│ │   ✓ test         passed         │ │
│ │                                 │ │
│ │ [View PR]  [Merge PR]           │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Description                         │
│ ─────────────────────────────────── │
│ Change Behind main (yellow) to...   │
└─────────────────────────────────────┘
```

### Settings Page Addition

```
┌─────────────────────────────────────┐
│ PR Status Settings                  │
│ ─────────────────────────────────── │
│                                     │
│ Polling interval: [30] seconds      │
│                   (10-300)          │
│                                     │
│ Default merge method:               │
│   ○ Merge commit                    │
│   ● Squash and merge                │
│   ○ Rebase and merge                │
│                                     │
│ ☑ Show rate limit warnings          │
│ ☐ Auto-merge when checks pass       │
│                                     │
│ GitHub API Status                   │
│ ─────────────────────────────────── │
│ Remaining: 4,823 / 5,000            │
│ Resets: in 47 minutes               │
└─────────────────────────────────────┘
```

---

## Migration Plan

| Phase | Scope | Owner |
|-------|-------|-------|
| 1 | Backend: worktree.rs + PR status endpoints | rust-supervisor |
| 2 | Frontend: Types + API functions | nextjs-supervisor |
| 3 | Frontend: Worktree/PR UI components | nextjs-supervisor |
| 4 | Frontend: Settings page PR config | nextjs-supervisor |
| 5 | Hooks: Update all affected hooks | manual |
| 6 | Agents: CLAUDE.md + supervisor configs | manual |
| 7 | Cleanup: Remove deprecated code | both |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Disk space | Worktrees share `.git` objects |
| Agent crashes | Idempotent POST endpoint |
| Dirty main directory | Session-start warning |
| Stale worktrees | Auto-cleanup on PR merge |
| Rate limits | Configurable polling, rate limit display |
| Breaking changes | Keep old endpoints during transition |

---

## Advanced: Early Dependency Sync (Optional)

If a child needs dependency code before it's merged to main:

```bash
cd .worktrees/bd-EPIC-001.2
git fetch origin
git merge --no-edit bd-EPIC-001.1
```

⚠️ Use only when necessary (e.g., type errors from missing schemas).

---

## Setup Requirements

### .gitignore Entry

Add `.worktrees/` to the project's root `.gitignore`:

```gitignore
# Git worktrees (managed by git worktree, not tracked)
.worktrees/
```

**Why:** Prevents accidental tracking of worktree contents if an agent runs `git add .` from the main directory. While `git worktree` manages these separately, this is a safety net.

**Implementation:** The `POST /api/git/worktree` endpoint should check for this entry and add it if missing:

```rust
// In create_worktree handler
fn ensure_gitignore_entry(repo_path: &str) -> Result<()> {
    let gitignore_path = format!("{}/.gitignore", repo_path);
    let content = fs::read_to_string(&gitignore_path).unwrap_or_default();
    
    if !content.contains(".worktrees/") {
        let mut file = fs::OpenOptions::new()
            .append(true)
            .create(true)
            .open(&gitignore_path)?;
        writeln!(file, "\n# Git worktrees\n.worktrees/")?;
    }
    Ok(())
}
```

This ensures the safety net is always in place, even for existing projects.
