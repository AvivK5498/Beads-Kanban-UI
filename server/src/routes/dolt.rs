//! Dolt status and discovery API endpoints.

use axum::{extract::Extension, response::IntoResponse, Json};
use std::sync::Arc;

use crate::dolt::DoltManager;

/// GET /api/dolt/status
///
/// Returns Dolt server availability and database count.
pub async fn dolt_status(
    Extension(dolt): Extension<Arc<DoltManager>>,
) -> impl IntoResponse {
    let running = dolt.check_server().await;

    let database_count = if running {
        dolt.discover_databases().await.ok().map(|dbs| dbs.len())
    } else {
        None
    };

    Json(serde_json::json!({
        "running": running,
        "database_count": database_count,
    }))
}

/// GET /api/dolt/databases
///
/// Lists all beads databases discovered via SHOW DATABASES.
pub async fn dolt_databases(
    Extension(dolt): Extension<Arc<DoltManager>>,
) -> impl IntoResponse {
    if !dolt.is_available() && !dolt.check_server().await {
        return Json(serde_json::json!({
            "error": "Dolt server not running",
            "databases": [],
        }));
    }

    match dolt.discover_databases().await {
        Ok(databases) => Json(serde_json::json!({ "databases": databases })),
        Err(e) => Json(serde_json::json!({
            "error": e.to_string(),
            "databases": [],
        })),
    }
}
