//! Filesystem API route handlers.
//!
//! Provides endpoints for listing directories and checking path existence.

use axum::{
    extract::Query,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::validate_path_security;

/// Query parameters for the list directory endpoint.
#[derive(Debug, Deserialize)]
pub struct FsListParams {
    /// The directory path to list
    pub path: String,
}

/// Query parameters for the path exists endpoint.
#[derive(Debug, Deserialize)]
pub struct FsExistsParams {
    /// The path to check for existence
    pub path: String,
}

/// Query parameters for the read file endpoint.
#[derive(Debug, Deserialize)]
pub struct FsReadParams {
    /// The file path to read (relative, e.g., ".designs/epic.md")
    pub path: String,
    /// The project path (absolute directory path)
    pub project_path: String,
}

/// Request body for opening a path in an external application.
#[derive(Debug, Deserialize)]
pub struct OpenExternalRequest {
    /// The path to open
    pub path: String,
    /// Target application: "vscode", "cursor", or "finder"
    pub target: String,
}

/// A single directory entry.
#[derive(Debug, Serialize)]
pub struct DirectoryEntry {
    /// The file/directory name
    pub name: String,
    /// The full path
    pub path: String,
    /// Whether this entry is a directory
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
}

/// GET /api/fs/list?path=/some/directory
///
/// Lists the contents of a directory, filtering out hidden files
/// except for .beads directories.
pub async fn list_directory(Query(params): Query<FsListParams>) -> impl IntoResponse {
    let dir_path = PathBuf::from(&params.path);

    // Security: Validate path is within allowed directories
    if let Err(e) = validate_path_security(&dir_path) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": e })),
        );
    }

    // Check if path exists and is a directory
    if !dir_path.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Path does not exist" })),
        );
    }

    if !dir_path.is_dir() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Path is not a directory" })),
        );
    }

    // Read directory entries
    let read_dir = match std::fs::read_dir(&dir_path) {
        Ok(rd) => rd,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Failed to read directory: {}", e) })),
            );
        }
    };

    let mut entries: Vec<DirectoryEntry> = Vec::new();

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("Failed to read directory entry: {}", e);
                continue;
            }
        };

        let name = entry.file_name().to_string_lossy().to_string();

        // Filter out hidden files except .beads
        if name.starts_with('.') && name != ".beads" {
            continue;
        }

        let path = entry.path();
        let is_directory = path.is_dir();

        entries.push(DirectoryEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory,
        });
    }

    // Sort entries: directories first, then alphabetically
    entries.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    (StatusCode::OK, Json(serde_json::json!({ "entries": entries })))
}

/// GET /api/fs/exists?path=/some/path
///
/// Checks if a path exists on the filesystem.
pub async fn path_exists(Query(params): Query<FsExistsParams>) -> impl IntoResponse {
    let path = PathBuf::from(&params.path);

    // Security: Validate path is within allowed directories
    if let Err(e) = validate_path_security(&path) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": e })),
        );
    }

    let exists = path.exists();

    (StatusCode::OK, Json(serde_json::json!({ "exists": exists })))
}

/// GET /api/fs/read?path=.designs/{EPIC_ID}.md&project_path=/absolute/path
///
/// Reads a design document file from the .designs directory.
///
/// # Security constraints:
/// - Max file size: 100KB
/// - Only .md extension allowed
/// - Path must be within project directory
/// - Path must start with ".designs/"
pub async fn read_file(Query(params): Query<FsReadParams>) -> impl IntoResponse {
    // Security: Path must start with .designs/
    if !params.path.starts_with(".designs/") {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Access denied: path must start with .designs/"
            })),
        );
    }

    // Parse relative path to validate extension
    let relative_path = PathBuf::from(&params.path);

    // Security: Only .md extension allowed
    if relative_path.extension().and_then(|s| s.to_str()) != Some("md") {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Access denied: only .md files are allowed"
            })),
        );
    }

    // Join project path with relative design doc path to get absolute path
    let project_root = PathBuf::from(&params.project_path);
    let file_path = project_root.join(&params.path);

    // Security: Validate absolute path is within allowed directories
    if let Err(e) = validate_path_security(&file_path) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": e })),
        );
    }

    // Check if file exists
    if !file_path.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "File does not exist" })),
        );
    }

    // Check if path is a file (not a directory)
    if !file_path.is_file() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Path is not a file" })),
        );
    }

    // Security: Check file size (max 100KB)
    let metadata = match std::fs::metadata(&file_path) {
        Ok(m) => m,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("Failed to read file metadata: {}", e)
                })),
            );
        }
    };

    const MAX_FILE_SIZE: u64 = 100 * 1024; // 100KB
    if metadata.len() > MAX_FILE_SIZE {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(serde_json::json!({
                "error": format!("File too large: {} bytes (max {} bytes)", metadata.len(), MAX_FILE_SIZE)
            })),
        );
    }

    // Read file contents
    let contents = match std::fs::read_to_string(&file_path) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("Failed to read file: {}", e)
                })),
            );
        }
    };

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "content": contents,
            "path": params.path
        })),
    )
}

/// POST /api/fs/open-external
///
/// Opens a path in an external application (VS Code, Cursor, or Finder/Explorer).
///
/// # Security constraints:
/// - Path must be within user's home directory
/// - Target must be one of: "vscode", "cursor", "finder"
pub async fn open_external(Json(request): Json<OpenExternalRequest>) -> impl IntoResponse {
    let path = PathBuf::from(&request.path);

    // Security: Validate path is within allowed directories
    if let Err(e) = validate_path_security(&path) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": e })),
        );
    }

    // Check if path exists
    if !path.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Path does not exist" })),
        );
    }

    // Execute the appropriate command based on target
    let result = match request.target.as_str() {
        "vscode" => {
            // Try "code" command first, fall back to macOS open command
            let code_result = std::process::Command::new("code").arg(&path).spawn();
            if code_result.is_err() {
                // Fallback for macOS: use open -a "Visual Studio Code"
                #[cfg(target_os = "macos")]
                {
                    std::process::Command::new("open")
                        .args(["-a", "Visual Studio Code"])
                        .arg(&path)
                        .spawn()
                }
                #[cfg(not(target_os = "macos"))]
                {
                    code_result
                }
            } else {
                code_result
            }
        }
        "cursor" => {
            // Try "cursor" command first, fall back to macOS open command
            let cursor_result = std::process::Command::new("cursor").arg(&path).spawn();
            if cursor_result.is_err() {
                // Fallback for macOS: use open -a "Cursor"
                #[cfg(target_os = "macos")]
                {
                    std::process::Command::new("open")
                        .args(["-a", "Cursor"])
                        .arg(&path)
                        .spawn()
                }
                #[cfg(not(target_os = "macos"))]
                {
                    cursor_result
                }
            } else {
                cursor_result
            }
        }
        "finder" => {
            // Use the `open` crate for cross-platform support
            // On macOS: opens Finder, on Linux: file manager, on Windows: Explorer
            match open::that(&path) {
                Ok(_) => {
                    return (
                        StatusCode::OK,
                        Json(serde_json::json!({ "success": true })),
                    );
                }
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "error": format!("Failed to open: {}", e)
                        })),
                    );
                }
            }
        }
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "Invalid target. Must be 'vscode', 'cursor', or 'finder'"
                })),
            );
        }
    };

    match result {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({ "success": true })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": format!("Failed to open: {}. Make sure the application is installed.", e)
            })),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_directory_entry_serialization() {
        let entry = DirectoryEntry {
            name: "test".to_string(),
            path: "/home/user/test".to_string(),
            is_directory: true,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"isDirectory\":true"));
    }
}
