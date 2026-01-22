//! Route handlers for the beads-server API.
//!
//! This module contains all HTTP route handlers.
//! Additional handlers will be added as API endpoints are implemented.

pub mod beads;
pub mod cli;
pub mod fs;
pub mod git;
pub mod projects;
pub mod watch;
pub mod worktree;

pub use projects::project_routes;
pub use watch::watch_beads;

use axum::{response::IntoResponse, Json};
use directories::UserDirs;
use serde::Serialize;
use std::path::Path;

/// Health check response structure.
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
}

/// Health check endpoint handler.
///
/// Returns a JSON response indicating the server is running.
pub async fn health() -> impl IntoResponse {
    Json(HealthResponse { status: "ok" })
}

/// Validates that a path is within allowed directories (user home).
///
/// # Security
///
/// This function ensures that:
/// - The path is within the user's home directory
/// - No path traversal attacks are possible
///
/// # Returns
///
/// - `Ok(())` if the path is valid and within allowed directories
/// - `Err(String)` with an error message if validation fails
pub fn validate_path_security(path: &Path) -> Result<(), String> {
    // Get the user's home directory
    let user_dirs = match UserDirs::new() {
        Some(u) => u,
        None => return Err("Could not determine user directories".to_string()),
    };

    let home_dir = user_dirs.home_dir();

    // Canonicalize paths for comparison (resolves symlinks and ..)
    let canonical_path = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // If path doesn't exist yet, check the parent
            if let Some(parent) = path.parent() {
                match parent.canonicalize() {
                    Ok(p) => p.join(path.file_name().unwrap_or_default()),
                    Err(_) => return Err("Invalid path".to_string()),
                }
            } else {
                return Err("Invalid path".to_string());
            }
        }
    };

    let canonical_home = match home_dir.canonicalize() {
        Ok(h) => h,
        Err(_) => return Err("Could not canonicalize home directory".to_string()),
    };

    // Check if the path starts with the home directory
    if !canonical_path.starts_with(&canonical_home) {
        return Err("Access denied: path must be within home directory".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_validate_home_path() {
        if let Some(user_dirs) = UserDirs::new() {
            let test_path = user_dirs.home_dir().join("test");
            // This might fail if test doesn't exist, but the parent check should work
            let result = validate_path_security(&test_path);
            // Should either succeed or fail with "Invalid path" (if test doesn't exist)
            assert!(result.is_ok() || result.unwrap_err().contains("Invalid"));
        }
    }

    #[test]
    fn test_reject_outside_home() {
        let result = validate_path_security(&PathBuf::from("/etc/passwd"));
        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("denied") || err_msg.contains("Invalid"));
    }
}
