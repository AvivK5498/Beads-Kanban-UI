//! Worktree route handlers for managing git worktrees and PR status.
//!
//! Provides endpoints for:
//! - Worktree CRUD operations (create, delete, list, status)
//! - PR status checking and management via GitHub CLI

use axum::{extract::Query, http::StatusCode, response::IntoResponse, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use tokio::process::Command;

// ============================================================================
// Worktree Status Endpoint
// ============================================================================

/// Query parameters for worktree status endpoint.
#[derive(Deserialize)]
pub struct WorktreeStatusParams {
    /// Path to the git repository.
    pub repo_path: String,
    /// Bead ID to check worktree status for.
    pub bead_id: String,
}

/// Response body for the worktree status endpoint.
#[derive(Serialize)]
pub struct WorktreeStatusResponse {
    /// Whether the worktree exists.
    pub exists: bool,
    /// Path to the worktree.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    /// Branch name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// Number of commits ahead of main.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ahead: Option<i32>,
    /// Number of commits behind main.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behind: Option<i32>,
    /// Whether there are uncommitted changes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dirty: Option<bool>,
    /// Last modification time of the worktree.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<DateTime<Utc>>,
}

/// Get the status of a worktree for a specific bead.
///
/// # Endpoint
///
/// `GET /api/git/worktree-status?repo_path=...&bead_id=...`
///
/// # Response
///
/// Returns worktree existence, path, branch, ahead/behind counts, and dirty status.
pub async fn worktree_status(Query(params): Query<WorktreeStatusParams>) -> impl IntoResponse {
    let repo_path = Path::new(&params.repo_path);

    // Validate repository path exists
    if !repo_path.exists() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("Repository path does not exist: {}", params.repo_path)
            })),
        )
            .into_response();
    }

    let branch_name = format!("bd-{}", params.bead_id);
    let worktree_path = repo_path.join(".worktrees").join(&branch_name);

    if !worktree_path.exists() {
        return Json(WorktreeStatusResponse {
            exists: false,
            worktree_path: None,
            branch: None,
            ahead: None,
            behind: None,
            dirty: None,
            last_modified: None,
        })
        .into_response();
    }

    // Get ahead/behind counts relative to main
    let (ahead, behind) = get_ahead_behind_worktree(&params.repo_path, &branch_name).await;

    // Check for uncommitted changes in the worktree
    let dirty = check_worktree_dirty(&worktree_path.to_string_lossy()).await;

    // Get last modification time
    let last_modified = get_last_modified(&worktree_path);

    Json(WorktreeStatusResponse {
        exists: true,
        worktree_path: Some(worktree_path.to_string_lossy().to_string()),
        branch: Some(branch_name),
        ahead: Some(ahead),
        behind: Some(behind),
        dirty: Some(dirty),
        last_modified,
    })
    .into_response()
}

// ============================================================================
// Create Worktree Endpoint (Idempotent)
// ============================================================================

/// Request body for creating a worktree.
#[derive(Deserialize)]
pub struct CreateWorktreeRequest {
    /// Path to the git repository.
    pub repo_path: String,
    /// Bead ID for the worktree.
    pub bead_id: String,
    /// Base branch to create from (defaults to "main").
    #[serde(default = "default_base_branch")]
    pub base_branch: String,
}

fn default_base_branch() -> String {
    "main".to_string()
}

/// Response body for the create worktree endpoint.
#[derive(Serialize)]
pub struct CreateWorktreeResponse {
    /// Whether the operation was successful.
    pub success: bool,
    /// Path to the worktree.
    pub worktree_path: String,
    /// Branch name.
    pub branch: String,
    /// True if worktree already existed (idempotent response).
    pub already_existed: bool,
}

/// Create a worktree for a bead. This operation is idempotent.
///
/// # Endpoint
///
/// `POST /api/git/worktree`
///
/// # Request Body
///
/// ```json
/// {
///   "repo_path": "/path/to/repo",
///   "bead_id": "BD-001",
///   "base_branch": "main"
/// }
/// ```
///
/// # Response
///
/// Returns the worktree path and whether it already existed.
pub async fn create_worktree(Json(request): Json<CreateWorktreeRequest>) -> impl IntoResponse {
    let repo_path = Path::new(&request.repo_path);

    // Validate repository path exists
    if !repo_path.exists() || !repo_path.is_dir() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("Repository path does not exist: {}", request.repo_path)
            })),
        )
            .into_response();
    }

    // Ensure .worktrees/ is in .gitignore
    if let Err(e) = ensure_gitignore_entry(&request.repo_path) {
        tracing::warn!("Failed to update .gitignore: {}", e);
    }

    let branch_name = format!("bd-{}", request.bead_id);
    let worktrees_dir = repo_path.join(".worktrees");
    let worktree_path = worktrees_dir.join(&branch_name);

    // Check if worktree already exists (idempotent)
    if worktree_path.exists() {
        return Json(CreateWorktreeResponse {
            success: true,
            worktree_path: worktree_path.to_string_lossy().to_string(),
            branch: branch_name,
            already_existed: true,
        })
        .into_response();
    }

    // Create .worktrees directory if it doesn't exist
    if let Err(e) = fs::create_dir_all(&worktrees_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": format!("Failed to create .worktrees directory: {}", e)
            })),
        )
            .into_response();
    }

    // Create the worktree with a new branch
    let output = Command::new("git")
        .args([
            "worktree",
            "add",
            &worktree_path.to_string_lossy(),
            "-b",
            &branch_name,
            &request.base_branch,
        ])
        .current_dir(&request.repo_path)
        .output()
        .await;

    match output {
        Ok(output) if output.status.success() => Json(CreateWorktreeResponse {
            success: true,
            worktree_path: worktree_path.to_string_lossy().to_string(),
            branch: branch_name,
            already_existed: false,
        })
        .into_response(),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Check if branch already exists (perhaps worktree was removed but branch exists)
            if stderr.contains("already exists") {
                // Try to add worktree using existing branch
                let retry_output = Command::new("git")
                    .args([
                        "worktree",
                        "add",
                        &worktree_path.to_string_lossy(),
                        &branch_name,
                    ])
                    .current_dir(&request.repo_path)
                    .output()
                    .await;

                match retry_output {
                    Ok(output) if output.status.success() => Json(CreateWorktreeResponse {
                        success: true,
                        worktree_path: worktree_path.to_string_lossy().to_string(),
                        branch: branch_name,
                        already_existed: true, // Branch existed even if worktree didn't
                    })
                    .into_response(),
                    Ok(output) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "error": format!("Failed to create worktree: {}", String::from_utf8_lossy(&output.stderr))
                        })),
                    )
                        .into_response(),
                    Err(e) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "error": format!("Failed to run git command: {}", e)
                        })),
                    )
                        .into_response(),
                }
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": format!("Failed to create worktree: {}", stderr)
                    })),
                )
                    .into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": format!("Failed to run git command: {}", e)
            })),
        )
            .into_response(),
    }
}

// ============================================================================
// Delete Worktree Endpoint
// ============================================================================

/// Request body for deleting a worktree.
#[derive(Deserialize)]
pub struct DeleteWorktreeRequest {
    /// Path to the git repository.
    pub repo_path: String,
    /// Bead ID for the worktree to delete.
    pub bead_id: String,
}

/// Response body for the delete worktree endpoint.
#[derive(Serialize)]
pub struct DeleteWorktreeResponse {
    /// Whether the operation was successful.
    pub success: bool,
}

/// Delete a worktree for a bead.
///
/// # Endpoint
///
/// `DELETE /api/git/worktree`
///
/// # Request Body
///
/// ```json
/// {
///   "repo_path": "/path/to/repo",
///   "bead_id": "BD-001"
/// }
/// ```
pub async fn delete_worktree(Json(request): Json<DeleteWorktreeRequest>) -> impl IntoResponse {
    let repo_path = Path::new(&request.repo_path);

    // Validate repository path exists
    if !repo_path.exists() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("Repository path does not exist: {}", request.repo_path)
            })),
        )
            .into_response();
    }

    let branch_name = format!("bd-{}", request.bead_id);
    let worktree_path = repo_path.join(".worktrees").join(&branch_name);

    // Check if worktree exists
    if !worktree_path.exists() {
        return Json(DeleteWorktreeResponse { success: true }).into_response();
    }

    // Remove the worktree
    let output = Command::new("git")
        .args(["worktree", "remove", &worktree_path.to_string_lossy()])
        .current_dir(&request.repo_path)
        .output()
        .await;

    let worktree_removed = match output {
        Ok(output) if output.status.success() => true,
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Try force remove if there are untracked changes
            if stderr.contains("contains modified or untracked files") {
                let force_output = Command::new("git")
                    .args([
                        "worktree",
                        "remove",
                        "--force",
                        &worktree_path.to_string_lossy(),
                    ])
                    .current_dir(&request.repo_path)
                    .output()
                    .await;

                match force_output {
                    Ok(output) if output.status.success() => true,
                    _ => {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(serde_json::json!({
                                "error": format!("Failed to remove worktree: {}", stderr)
                            })),
                        )
                            .into_response();
                    }
                }
            } else {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": format!("Failed to remove worktree: {}", stderr)
                    })),
                )
                    .into_response();
            }
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("Failed to run git command: {}", e)
                })),
            )
                .into_response();
        }
    };

    if worktree_removed {
        // Delete local branch (ignore errors - branch may not exist or be already deleted)
        let _ = Command::new("git")
            .args(["branch", "-D", &branch_name])
            .current_dir(&request.repo_path)
            .output()
            .await;

        // Close the bead (ignore errors - bead may not exist or already be closed)
        let _ = Command::new("bd")
            .args(["close", &request.bead_id])
            .current_dir(&request.repo_path)
            .output()
            .await;
    }

    Json(DeleteWorktreeResponse { success: true }).into_response()
}

// ============================================================================
// List Worktrees Endpoint
// ============================================================================

/// Query parameters for listing worktrees.
#[derive(Deserialize)]
pub struct ListWorktreesParams {
    /// Path to the git repository.
    pub repo_path: String,
}

/// Single worktree entry in the list response.
#[derive(Serialize)]
pub struct WorktreeEntry {
    /// Path to the worktree.
    pub path: String,
    /// Branch name.
    pub branch: String,
    /// Extracted bead ID (if it matches bd-{ID} pattern).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bead_id: Option<String>,
}

/// Response body for the list worktrees endpoint.
#[derive(Serialize)]
pub struct ListWorktreesResponse {
    /// List of worktrees.
    pub worktrees: Vec<WorktreeEntry>,
}

/// List all worktrees in a repository.
///
/// # Endpoint
///
/// `GET /api/git/worktrees?repo_path=...`
///
/// # Response
///
/// Returns a list of all worktrees with their paths, branches, and bead IDs.
pub async fn list_worktrees(Query(params): Query<ListWorktreesParams>) -> impl IntoResponse {
    let repo_path = Path::new(&params.repo_path);

    // Validate repository path exists
    if !repo_path.exists() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("Repository path does not exist: {}", params.repo_path)
            })),
        )
            .into_response();
    }

    // List worktrees
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&params.repo_path)
        .output()
        .await;

    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let worktrees = parse_worktree_list(&stdout, &params.repo_path);
            Json(ListWorktreesResponse { worktrees }).into_response()
        }
        Ok(output) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": format!("Failed to list worktrees: {}", String::from_utf8_lossy(&output.stderr))
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": format!("Failed to run git command: {}", e)
            })),
        )
            .into_response(),
    }
}

/// Parse the porcelain output of `git worktree list`.
fn parse_worktree_list(output: &str, repo_path: &str) -> Vec<WorktreeEntry> {
    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;

    for line in output.lines() {
        if line.starts_with("worktree ") {
            // Save previous entry if complete
            if let (Some(path), Some(branch)) = (current_path.take(), current_branch.take()) {
                // Only include worktrees in .worktrees directory
                if path.contains(".worktrees/bd-") {
                    let bead_id = extract_bead_id(&branch);
                    worktrees.push(WorktreeEntry {
                        path,
                        branch,
                        bead_id,
                    });
                }
            }
            current_path = Some(line.trim_start_matches("worktree ").to_string());
        } else if line.starts_with("branch ") {
            // Extract just the branch name from refs/heads/...
            let full_ref = line.trim_start_matches("branch ");
            current_branch = Some(
                full_ref
                    .trim_start_matches("refs/heads/")
                    .to_string(),
            );
        }
    }

    // Don't forget the last entry
    if let (Some(path), Some(branch)) = (current_path, current_branch) {
        if path.contains(".worktrees/bd-") {
            let bead_id = extract_bead_id(&branch);
            worktrees.push(WorktreeEntry {
                path,
                branch,
                bead_id,
            });
        }
    }

    // Also include worktrees from main repo .worktrees directory that may not be in git worktree list
    // (handles orphaned worktree directories)
    let worktrees_dir = Path::new(repo_path).join(".worktrees");
    if worktrees_dir.exists() {
        if let Ok(entries) = fs::read_dir(&worktrees_dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    if dir_name.starts_with("bd-") {
                        // Check if already in list
                        let already_listed = worktrees.iter().any(|w| w.path.ends_with(&dir_name));
                        if !already_listed {
                            let bead_id = extract_bead_id(&dir_name);
                            worktrees.push(WorktreeEntry {
                                path: entry_path.to_string_lossy().to_string(),
                                branch: dir_name,
                                bead_id,
                            });
                        }
                    }
                }
            }
        }
    }

    worktrees
}

/// Extract bead ID from a branch name like "bd-BD-001".
fn extract_bead_id(branch: &str) -> Option<String> {
    if branch.starts_with("bd-") {
        Some(branch.trim_start_matches("bd-").to_string())
    } else {
        None
    }
}

// ============================================================================
// PR Status Endpoint
// ============================================================================

/// Query parameters for PR status endpoint.
#[derive(Deserialize)]
pub struct PrStatusParams {
    /// Path to the git repository.
    pub repo_path: String,
    /// Bead ID to check PR status for.
    pub bead_id: String,
}

/// CI check status.
#[derive(Serialize)]
pub struct ChecksStatus {
    /// Total number of checks.
    pub total: i32,
    /// Number of passed checks.
    pub passed: i32,
    /// Number of failed checks.
    pub failed: i32,
    /// Number of pending checks.
    pub pending: i32,
    /// Overall status: "success", "failure", or "pending".
    pub status: String,
}

/// PR information.
#[derive(Serialize)]
pub struct PrInfo {
    /// PR number.
    pub number: i32,
    /// PR URL.
    pub url: String,
    /// PR state: "open", "merged", or "closed".
    pub state: String,
    /// CI checks status.
    pub checks: ChecksStatus,
    /// Whether the PR is mergeable.
    pub mergeable: bool,
}

/// Rate limit information.
#[derive(Serialize)]
pub struct RateLimitInfo {
    /// Remaining API calls.
    pub remaining: i32,
    /// Total limit.
    pub limit: i32,
    /// Reset time.
    pub reset_at: String,
}

/// Response body for the PR status endpoint.
#[derive(Serialize)]
pub struct PrStatusResponse {
    /// Whether the repo has a remote.
    pub has_remote: bool,
    /// Whether the branch has been pushed.
    pub branch_pushed: bool,
    /// PR information (if exists).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr: Option<PrInfo>,
    /// Rate limit information.
    pub rate_limit: RateLimitInfo,
}

/// Get PR status for a bead's branch.
///
/// # Endpoint
///
/// `GET /api/git/pr-status?repo_path=...&bead_id=...`
///
/// # Response
///
/// Returns PR information, CI checks, and rate limit info.
pub async fn pr_status(Query(params): Query<PrStatusParams>) -> impl IntoResponse {
    let repo_path = Path::new(&params.repo_path);

    // Validate repository path exists
    if !repo_path.exists() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("Repository path does not exist: {}", params.repo_path)
            })),
        )
            .into_response();
    }

    let branch_name = format!("bd-{}", params.bead_id);

    // Check if repo has a remote
    let has_remote = check_has_remote(&params.repo_path).await;

    // Check if branch has been pushed
    let branch_pushed = if has_remote {
        check_branch_pushed(&params.repo_path, &branch_name).await
    } else {
        false
    };

    // Get rate limit info (before PR status to avoid using up calls)
    let rate_limit = get_rate_limit(&params.repo_path).await;

    // Get PR info if branch is pushed
    let pr = if branch_pushed {
        get_pr_info(&params.repo_path, &branch_name).await
    } else {
        None
    };

    Json(PrStatusResponse {
        has_remote,
        branch_pushed,
        pr,
        rate_limit,
    })
    .into_response()
}

// ============================================================================
// Create PR Endpoint
// ============================================================================

/// Request body for creating a PR.
#[derive(Deserialize)]
pub struct CreatePrRequest {
    /// Path to the git repository.
    pub repo_path: String,
    /// Bead ID for the PR.
    pub bead_id: String,
    /// PR title.
    pub title: String,
    /// PR body.
    pub body: String,
}

/// Response body for the create PR endpoint.
#[derive(Serialize)]
pub struct CreatePrResponse {
    /// Whether the operation was successful.
    pub success: bool,
    /// PR number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr_number: Option<i32>,
    /// PR URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr_url: Option<String>,
    /// Error message if failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Create a PR for a bead's branch.
///
/// # Endpoint
///
/// `POST /api/git/create-pr`
///
/// # Request Body
///
/// ```json
/// {
///   "repo_path": "/path/to/repo",
///   "bead_id": "BD-001",
///   "title": "Fix: Branch badge readability",
///   "body": "Closes BD-001\n\n..."
/// }
/// ```
pub async fn create_pr(Json(request): Json<CreatePrRequest>) -> impl IntoResponse {
    let repo_path = Path::new(&request.repo_path);

    // Validate repository path exists
    if !repo_path.exists() {
        return (
            StatusCode::BAD_REQUEST,
            Json(CreatePrResponse {
                success: false,
                pr_number: None,
                pr_url: None,
                error: Some(format!("Repository path does not exist: {}", request.repo_path)),
            }),
        )
            .into_response();
    }

    let branch_name = format!("bd-{}", request.bead_id);

    // Create PR using gh cli
    let output = Command::new("gh")
        .args([
            "pr",
            "create",
            "--head",
            &branch_name,
            "--title",
            &request.title,
            "--body",
            &request.body,
        ])
        .current_dir(&request.repo_path)
        .output()
        .await;

    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let pr_url = stdout.trim().to_string();
            let pr_number = extract_pr_number_from_url(&pr_url);
            Json(CreatePrResponse {
                success: true,
                pr_number,
                pr_url: Some(pr_url),
                error: None,
            })
            .into_response()
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(CreatePrResponse {
                    success: false,
                    pr_number: None,
                    pr_url: None,
                    error: Some(stderr.to_string()),
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(CreatePrResponse {
                success: false,
                pr_number: None,
                pr_url: None,
                error: Some(format!("Failed to run gh command: {}", e)),
            }),
        )
            .into_response(),
    }
}

// ============================================================================
// Merge PR Endpoint
// ============================================================================

/// Request body for merging a PR.
#[derive(Deserialize)]
pub struct MergePrRequest {
    /// Path to the git repository.
    pub repo_path: String,
    /// Bead ID for the PR to merge.
    pub bead_id: String,
    /// Merge method: "merge", "squash", or "rebase".
    #[serde(default = "default_merge_method")]
    pub merge_method: String,
}

fn default_merge_method() -> String {
    "squash".to_string()
}

/// Response body for the merge PR endpoint.
#[derive(Serialize)]
pub struct MergePrResponse {
    /// Whether the operation was successful.
    pub success: bool,
    /// Whether the PR was merged.
    pub merged: bool,
    /// Error message if failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Merge a PR for a bead's branch.
///
/// # Endpoint
///
/// `POST /api/git/merge-pr`
///
/// # Request Body
///
/// ```json
/// {
///   "repo_path": "/path/to/repo",
///   "bead_id": "BD-001",
///   "merge_method": "squash"
/// }
/// ```
pub async fn merge_pr(Json(request): Json<MergePrRequest>) -> impl IntoResponse {
    let repo_path = Path::new(&request.repo_path);

    // Validate repository path exists
    if !repo_path.exists() {
        return (
            StatusCode::BAD_REQUEST,
            Json(MergePrResponse {
                success: false,
                merged: false,
                error: Some(format!("Repository path does not exist: {}", request.repo_path)),
            }),
        )
            .into_response();
    }

    let branch_name = format!("bd-{}", request.bead_id);

    // Determine merge flag
    let merge_flag = match request.merge_method.as_str() {
        "merge" => "--merge",
        "rebase" => "--rebase",
        _ => "--squash", // Default to squash
    };

    // Merge PR using gh cli
    // Note: Don't use --delete-branch as it fails when branch is used by a worktree.
    // The cleanup step (delete_worktree) handles branch deletion.
    let output = Command::new("gh")
        .args(["pr", "merge", &branch_name, merge_flag])
        .current_dir(&request.repo_path)
        .output()
        .await;

    match output {
        Ok(output) if output.status.success() => Json(MergePrResponse {
            success: true,
            merged: true,
            error: None,
        })
        .into_response(),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(MergePrResponse {
                    success: false,
                    merged: false,
                    error: Some(stderr.to_string()),
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(MergePrResponse {
                success: false,
                merged: false,
                error: Some(format!("Failed to run gh command: {}", e)),
            }),
        )
            .into_response(),
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get the number of commits ahead and behind for a worktree branch.
async fn get_ahead_behind_worktree(repo_path: &str, branch: &str) -> (i32, i32) {
    let base_branches = ["main", "master"];

    for base in base_branches {
        let output = Command::new("git")
            .args([
                "rev-list",
                "--left-right",
                "--count",
                &format!("{}...{}", base, branch),
            ])
            .current_dir(repo_path)
            .output()
            .await;

        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let parts: Vec<&str> = stdout.trim().split('\t').collect();
                if parts.len() == 2 {
                    let behind = parts[0].parse().unwrap_or(0);
                    let ahead = parts[1].parse().unwrap_or(0);
                    return (ahead, behind);
                }
            }
        }
    }

    (0, 0)
}

/// Check if a worktree has uncommitted changes.
async fn check_worktree_dirty(worktree_path: &str) -> bool {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(worktree_path)
        .output()
        .await;

    match output {
        Ok(o) => !o.stdout.is_empty(),
        Err(_) => false,
    }
}

/// Get the last modification time of a directory.
fn get_last_modified(path: &Path) -> Option<DateTime<Utc>> {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(DateTime::<Utc>::from)
}

/// Check if repository has a remote.
async fn check_has_remote(repo_path: &str) -> bool {
    let output = Command::new("git")
        .args(["remote"])
        .current_dir(repo_path)
        .output()
        .await;

    match output {
        Ok(o) => !o.stdout.is_empty(),
        Err(_) => false,
    }
}

/// Check if a branch has been pushed to remote.
async fn check_branch_pushed(repo_path: &str, branch: &str) -> bool {
    let output = Command::new("git")
        .args(["ls-remote", "--heads", "origin", branch])
        .current_dir(repo_path)
        .output()
        .await;

    match output {
        Ok(o) => !o.stdout.is_empty(),
        Err(_) => false,
    }
}

/// Get rate limit information from GitHub API.
async fn get_rate_limit(repo_path: &str) -> RateLimitInfo {
    let output = Command::new("gh")
        .args(["api", "rate_limit", "--jq", ".rate"])
        .current_dir(repo_path)
        .output()
        .await;

    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let remaining = json["remaining"].as_i64().unwrap_or(0) as i32;
                let limit = json["limit"].as_i64().unwrap_or(5000) as i32;
                let reset = json["reset"].as_i64().unwrap_or(0);
                let reset_at =
                    DateTime::<Utc>::from_timestamp(reset, 0).map(|dt| dt.to_rfc3339()).unwrap_or_default();
                return RateLimitInfo {
                    remaining,
                    limit,
                    reset_at,
                };
            }
        }
        _ => {}
    }

    // Default fallback
    RateLimitInfo {
        remaining: -1, // Unknown
        limit: 5000,
        reset_at: String::new(),
    }
}

/// Get PR information for a branch.
async fn get_pr_info(repo_path: &str, branch: &str) -> Option<PrInfo> {
    // Try to get PR info
    let output = Command::new("gh")
        .args([
            "pr",
            "view",
            branch,
            "--json",
            "number,url,state,mergeable,statusCheckRollup",
        ])
        .current_dir(repo_path)
        .output()
        .await;

    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let number = json["number"].as_i64().unwrap_or(0) as i32;
                let url = json["url"].as_str().unwrap_or("").to_string();
                let state = json["state"].as_str().unwrap_or("UNKNOWN").to_lowercase();
                let mergeable_str = json["mergeable"].as_str().unwrap_or("UNKNOWN");
                let mergeable = mergeable_str == "MERGEABLE";

                // Parse status checks
                let checks = parse_status_checks(&json["statusCheckRollup"]);

                return Some(PrInfo {
                    number,
                    url,
                    state,
                    checks,
                    mergeable,
                });
            }
        }
        _ => {}
    }

    None
}

/// Parse status check rollup from gh pr view output.
/// GitHub Actions returns:
/// - status: "QUEUED" | "IN_PROGRESS" | "COMPLETED"
/// - conclusion: "" | "SUCCESS" | "FAILURE" | "CANCELLED" (only set when COMPLETED)
fn parse_status_checks(rollup: &serde_json::Value) -> ChecksStatus {
    let mut total = 0;
    let mut passed = 0;
    let mut failed = 0;
    let mut pending = 0;

    if let Some(checks) = rollup.as_array() {
        for check in checks {
            total += 1;
            let status = check["status"].as_str().unwrap_or("");
            let conclusion = check["conclusion"].as_str().unwrap_or("");

            match status {
                "QUEUED" | "IN_PROGRESS" => pending += 1,
                "COMPLETED" => match conclusion {
                    "SUCCESS" => passed += 1,
                    "FAILURE" | "CANCELLED" | "TIMED_OUT" | "ACTION_REQUIRED" => failed += 1,
                    _ => pending += 1, // Unknown conclusion treated as pending
                },
                // Legacy status check API uses state/conclusion differently
                _ => match conclusion {
                    "SUCCESS" => passed += 1,
                    "FAILURE" | "ERROR" => failed += 1,
                    _ => pending += 1,
                },
            }
        }
    }

    let status = if total == 0 {
        "success".to_string() // No checks = success
    } else if failed > 0 {
        "failure".to_string()
    } else if pending > 0 {
        "pending".to_string()
    } else {
        "success".to_string()
    };

    ChecksStatus {
        total,
        passed,
        failed,
        pending,
        status,
    }
}

/// Extract PR number from a GitHub PR URL.
fn extract_pr_number_from_url(url: &str) -> Option<i32> {
    url.rsplit('/').next().and_then(|s| s.parse().ok())
}

/// Ensure .worktrees/ is in the repository's .gitignore.
fn ensure_gitignore_entry(repo_path: &str) -> Result<(), std::io::Error> {
    let gitignore_path = format!("{}/.gitignore", repo_path);
    let content = fs::read_to_string(&gitignore_path).unwrap_or_default();

    if !content.contains(".worktrees/") && !content.contains(".worktrees") {
        let mut file = OpenOptions::new()
            .append(true)
            .create(true)
            .open(&gitignore_path)?;
        writeln!(file, "\n# Git worktrees\n.worktrees/")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_bead_id() {
        assert_eq!(extract_bead_id("bd-BD-001"), Some("BD-001".to_string()));
        assert_eq!(extract_bead_id("bd-EPIC-001.1"), Some("EPIC-001.1".to_string()));
        assert_eq!(extract_bead_id("main"), None);
        assert_eq!(extract_bead_id("feature-branch"), None);
    }

    #[test]
    fn test_extract_pr_number_from_url() {
        assert_eq!(
            extract_pr_number_from_url("https://github.com/user/repo/pull/142"),
            Some(142)
        );
        assert_eq!(
            extract_pr_number_from_url("https://github.com/user/repo/pull/1"),
            Some(1)
        );
        assert_eq!(extract_pr_number_from_url("invalid-url"), None);
    }

    #[test]
    fn test_worktree_status_response_serialization() {
        let response = WorktreeStatusResponse {
            exists: true,
            worktree_path: Some("/repo/.worktrees/bd-BD-001".to_string()),
            branch: Some("bd-BD-001".to_string()),
            ahead: Some(5),
            behind: Some(2),
            dirty: Some(false),
            last_modified: None,
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"exists\":true"));
        assert!(json.contains("\"ahead\":5"));
        assert!(json.contains("\"behind\":2"));
    }

    #[test]
    fn test_create_worktree_response_serialization() {
        let response = CreateWorktreeResponse {
            success: true,
            worktree_path: "/repo/.worktrees/bd-BD-001".to_string(),
            branch: "bd-BD-001".to_string(),
            already_existed: false,
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"already_existed\":false"));
    }

    #[test]
    fn test_pr_status_response_serialization() {
        let response = PrStatusResponse {
            has_remote: true,
            branch_pushed: true,
            pr: Some(PrInfo {
                number: 142,
                url: "https://github.com/user/repo/pull/142".to_string(),
                state: "open".to_string(),
                checks: ChecksStatus {
                    total: 3,
                    passed: 2,
                    failed: 0,
                    pending: 1,
                    status: "pending".to_string(),
                },
                mergeable: true,
            }),
            rate_limit: RateLimitInfo {
                remaining: 4823,
                limit: 5000,
                reset_at: "2024-01-22T15:00:00Z".to_string(),
            },
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"has_remote\":true"));
        assert!(json.contains("\"number\":142"));
        assert!(json.contains("\"remaining\":4823"));
    }

    #[test]
    fn test_parse_status_checks_empty() {
        let empty = serde_json::json!([]);
        let checks = parse_status_checks(&empty);
        assert_eq!(checks.total, 0);
        assert_eq!(checks.status, "success");
    }

    #[test]
    fn test_parse_status_checks_queued() {
        // QUEUED status should count as pending
        let rollup = serde_json::json!([
            {"status": "QUEUED", "conclusion": ""},
            {"status": "IN_PROGRESS", "conclusion": ""}
        ]);
        let checks = parse_status_checks(&rollup);
        assert_eq!(checks.total, 2);
        assert_eq!(checks.pending, 2);
        assert_eq!(checks.passed, 0);
        assert_eq!(checks.failed, 0);
        assert_eq!(checks.status, "pending");
    }

    #[test]
    fn test_parse_status_checks_completed() {
        // COMPLETED status uses conclusion field
        let rollup = serde_json::json!([
            {"status": "COMPLETED", "conclusion": "SUCCESS"},
            {"status": "COMPLETED", "conclusion": "FAILURE"},
            {"status": "COMPLETED", "conclusion": "CANCELLED"}
        ]);
        let checks = parse_status_checks(&rollup);
        assert_eq!(checks.total, 3);
        assert_eq!(checks.passed, 1);
        assert_eq!(checks.failed, 2); // FAILURE + CANCELLED
        assert_eq!(checks.pending, 0);
        assert_eq!(checks.status, "failure");
    }

    #[test]
    fn test_parse_status_checks_mixed() {
        // Mix of queued, in-progress, and completed checks
        let rollup = serde_json::json!([
            {"status": "COMPLETED", "conclusion": "SUCCESS"},
            {"status": "QUEUED", "conclusion": ""},
            {"status": "COMPLETED", "conclusion": "FAILURE"}
        ]);
        let checks = parse_status_checks(&rollup);
        assert_eq!(checks.total, 3);
        assert_eq!(checks.passed, 1);
        assert_eq!(checks.pending, 1);
        assert_eq!(checks.failed, 1);
        assert_eq!(checks.status, "failure");
    }

    #[test]
    fn test_parse_status_checks_all_success() {
        let rollup = serde_json::json!([
            {"status": "COMPLETED", "conclusion": "SUCCESS"},
            {"status": "COMPLETED", "conclusion": "SUCCESS"}
        ]);
        let checks = parse_status_checks(&rollup);
        assert_eq!(checks.total, 2);
        assert_eq!(checks.passed, 2);
        assert_eq!(checks.pending, 0);
        assert_eq!(checks.failed, 0);
        assert_eq!(checks.status, "success");
    }
}
