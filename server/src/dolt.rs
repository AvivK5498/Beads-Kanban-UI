//! Dolt database connection manager.
//!
//! Provides direct MySQL connection to Dolt for reading beads data,
//! with database discovery via `SHOW DATABASES`.

use mysql_async::prelude::*;
use mysql_async::{Opts, OptsBuilder, Pool, PoolConstraints, PoolOpts, Row};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::net::TcpStream;
use tracing::info;

use crate::routes::beads::{Bead, Comment};

/// Default Dolt server connection parameters (configured by bd CLI).
const DOLT_HOST: &str = "127.0.0.1";
const DOLT_PORT: u16 = 3307;
const DOLT_USER: &str = "root";

/// Errors from Dolt operations.
#[derive(Debug, thiserror::Error)]
pub enum DoltError {
    #[error("MySQL connection failed: {0}")]
    ConnectionFailed(String),

    #[error("SQL query failed: {0}")]
    QueryFailed(String),

    #[error("Database not found: {0}")]
    DatabaseNotFound(String),
}

/// Manages the connection pool and operations against a Dolt MySQL server.
pub struct DoltManager {
    pool: Pool,
    available: AtomicBool,
}

impl DoltManager {
    /// Creates a new DoltManager with a connection pool to Dolt.
    pub fn new() -> Self {
        let pool_opts = PoolOpts::default()
            .with_constraints(PoolConstraints::new(0, 4).unwrap());

        let opts: Opts = OptsBuilder::default()
            .ip_or_hostname(DOLT_HOST)
            .tcp_port(DOLT_PORT)
            .user(Some(DOLT_USER))
            .pool_opts(pool_opts)
            .into();

        Self {
            pool: Pool::new(opts),
            available: AtomicBool::new(false),
        }
    }

    /// Checks if Dolt server is reachable via TCP.
    pub async fn check_server(&self) -> bool {
        let reachable = TcpStream::connect((DOLT_HOST, DOLT_PORT)).await.is_ok();
        self.available.store(reachable, Ordering::Relaxed);
        reachable
    }

    /// Returns cached availability (set by `check_server`).
    pub fn is_available(&self) -> bool {
        self.available.load(Ordering::Relaxed)
    }

    /// Discovers all beads databases via `SHOW DATABASES`.
    /// Returns database names that start with `beads_`.
    pub async fn discover_databases(&self) -> Result<Vec<DoltDatabase>, DoltError> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| DoltError::ConnectionFailed(e.to_string()))?;

        let rows: Vec<Row> = conn.query("SHOW DATABASES").await
            .map_err(|e| DoltError::QueryFailed(e.to_string()))?;

        let mut databases = Vec::new();
        for row in rows {
            let name: String = row.get(0).unwrap_or_default();
            if name.starts_with("beads_") {
                let project_name = name.strip_prefix("beads_")
                    .unwrap_or(&name)
                    .to_string();
                databases.push(DoltDatabase { name, project_name });
            }
        }

        self.available.store(true, Ordering::Relaxed);
        Ok(databases)
    }

    /// Reads beads (issues + comments + dependencies) from a specific Dolt database.
    pub async fn read_beads(&self, db_name: &str) -> Result<Vec<Bead>, DoltError> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| DoltError::ConnectionFailed(e.to_string()))?;

        // Check database exists
        let db_exists: Option<Row> = conn.exec_first(
            "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = :db",
            mysql_async::params! { "db" => db_name },
        ).await.map_err(|e| DoltError::QueryFailed(e.to_string()))?;

        if db_exists.is_none() {
            return Err(DoltError::DatabaseNotFound(db_name.to_string()));
        }

        // Read issues — format datetime columns as ISO strings in SQL
        let issues_query = format!(
            "SELECT id, title, description, `design`, status, priority, issue_type, \
             owner, assignee, \
             DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at, \
             created_by, \
             DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updated_at, \
             DATE_FORMAT(closed_at, '%Y-%m-%dT%H:%i:%sZ') AS closed_at, \
             close_reason \
             FROM `{}`.issues",
            db_name
        );
        let issue_rows: Vec<Row> = conn.query(&issues_query).await
            .map_err(|e| DoltError::QueryFailed(format!("issues: {}", e)))?;

        // Helper to safely get nullable string columns (mysql_async panics
        // on NULL → String conversion, so we must go through Option<Option<String>>).
        fn get_opt_str(row: &Row, col: &str) -> Option<String> {
            row.get::<Option<String>, _>(col).flatten()
        }
        fn get_str(row: &Row, col: &str) -> String {
            get_opt_str(row, col).unwrap_or_default()
        }

        let mut beads: Vec<Bead> = issue_rows.iter().map(|row| {
            Bead {
                id: get_str(row, "id"),
                title: get_str(row, "title"),
                description: get_opt_str(row, "description"),
                status: get_opt_str(row, "status").unwrap_or_else(|| "open".to_string()),
                priority: row.get::<Option<i32>, _>("priority").flatten(),
                issue_type: get_opt_str(row, "issue_type"),
                owner: get_opt_str(row, "owner"),
                created_at: get_opt_str(row, "created_at"),
                created_by: get_opt_str(row, "created_by"),
                updated_at: get_opt_str(row, "updated_at"),
                closed_at: get_opt_str(row, "closed_at"),
                close_reason: get_opt_str(row, "close_reason"),
                design_doc: get_opt_str(row, "design"),
                parent_id: None,
                children: None,
                deps: None,
                relates_to: None,
                comments: None,
                dependencies: None,
            }
        }).collect();

        // Read comments
        let comments_query = format!(
            "SELECT id, issue_id, author, text, \
             DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at \
             FROM `{}`.comments ORDER BY issue_id, id",
            db_name
        );
        let comment_rows: Vec<Row> = conn.query(&comments_query).await
            .map_err(|e| DoltError::QueryFailed(format!("comments: {}", e)))?;

        let mut comments_map: HashMap<String, Vec<Comment>> = HashMap::new();
        for row in &comment_rows {
            let issue_id = get_str(row, "issue_id");
            let comment = Comment {
                id: row.get::<Option<i64>, _>("id").flatten().unwrap_or(0),
                issue_id: issue_id.clone(),
                author: get_str(row, "author"),
                text: get_str(row, "text"),
                created_at: get_str(row, "created_at"),
            };
            comments_map.entry(issue_id).or_default().push(comment);
        }

        // Read dependencies
        let deps_query = format!(
            "SELECT issue_id, depends_on_id, `type` FROM `{}`.dependencies",
            db_name
        );
        let dep_rows: Vec<Row> = conn.query(&deps_query).await
            .map_err(|e| DoltError::QueryFailed(format!("dependencies: {}", e)))?;

        // Group dependencies by issue_id
        let mut parent_map: HashMap<String, String> = HashMap::new();
        let mut blocking_map: HashMap<String, Vec<String>> = HashMap::new();
        let mut related_map: HashMap<String, Vec<String>> = HashMap::new();

        for row in &dep_rows {
            let issue_id = get_str(row, "issue_id");
            let depends_on = get_str(row, "depends_on_id");
            let dep_type = get_str(row, "type");

            match dep_type.as_str() {
                "parent-child" | "parent" => {
                    parent_map.insert(issue_id, depends_on);
                }
                "relates-to" | "related" => {
                    related_map.entry(issue_id).or_default().push(depends_on);
                }
                _ => {
                    // "blocks", "blocking", or any other type → blocking dep
                    blocking_map.entry(issue_id).or_default().push(depends_on);
                }
            }
        }

        // Merge comments, dependencies into beads
        for bead in &mut beads {
            if let Some(bead_comments) = comments_map.remove(&bead.id) {
                bead.comments = Some(bead_comments);
            }
            if let Some(parent_id) = parent_map.remove(&bead.id) {
                bead.parent_id = Some(parent_id);
            }
            if let Some(blocking) = blocking_map.remove(&bead.id) {
                bead.deps = Some(blocking);
            }
            if let Some(related) = related_map.remove(&bead.id) {
                bead.relates_to = Some(related);
            }
        }

        self.available.store(true, Ordering::Relaxed);
        info!("Read {} beads from Dolt SQL (db: {})", beads.len(), db_name);
        Ok(beads)
    }

}

/// A discovered Dolt database.
#[derive(Debug, serde::Serialize)]
pub struct DoltDatabase {
    /// Full database name (e.g. `beads_ai-photo-factory`)
    pub name: String,
    /// Derived project name (e.g. `ai-photo-factory`)
    pub project_name: String,
}

/// Metadata from `.beads/metadata.json`.
#[derive(Debug, Deserialize)]
struct BeadsMetadata {
    #[serde(default)]
    backend: Option<String>,
    #[serde(default)]
    dolt_database: Option<String>,
}

/// Config from `.beads/config.yaml`.
#[derive(Debug, Deserialize)]
struct BeadsConfig {
    #[serde(default, rename = "issue-prefix")]
    issue_prefix: Option<String>,
}

/// Resolves the Dolt database name for a project path.
///
/// Checks `.beads/metadata.json` → `dolt_database` field first,
/// then falls back to `beads_` + issue-prefix from config.yaml.
/// Returns `None` if the project doesn't use Dolt backend.
pub fn database_name_for_project(project_path: &Path) -> Option<String> {
    // Try metadata.json first
    let metadata_path = project_path.join(".beads").join("metadata.json");
    if let Ok(contents) = std::fs::read_to_string(&metadata_path) {
        if let Ok(meta) = serde_json::from_str::<BeadsMetadata>(&contents) {
            // Only use Dolt if backend is explicitly "dolt"
            if meta.backend.as_deref() != Some("dolt") {
                return None;
            }
            if let Some(db_name) = meta.dolt_database {
                if !db_name.is_empty() {
                    return Some(db_name);
                }
            }
        }
    }

    // Fallback: beads_ + issue-prefix from config.yaml
    let config_path = project_path.join(".beads").join("config.yaml");
    if let Ok(contents) = std::fs::read_to_string(&config_path) {
        if let Ok(config) = serde_yaml::from_str::<BeadsConfig>(&contents) {
            if let Some(prefix) = config.issue_prefix {
                if !prefix.is_empty() {
                    return Some(format!("beads_{}", prefix));
                }
            }
        }
    }

    // Last resort: derive from directory name
    project_path.file_name()
        .and_then(|n| n.to_str())
        .map(|name| format!("beads_{}", name))
}
