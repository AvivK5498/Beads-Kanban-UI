//! Beads Kanban UI Server
//!
//! An Axum-based HTTP server that serves the beads-kanban-ui frontend
//! and provides API endpoints for backend functionality.

mod db;
mod routes;

use axum::{
    body::Body,
    http::{header, Request, Response, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Router,
};
use rust_embed::Embed;
use std::env;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

/// Embedded static files from the Next.js build output.
#[derive(Embed)]
#[folder = "../out/"]
struct Assets;

/// Serves embedded static files, with fallback to index.html for SPA routing.
async fn serve_static(req: Request<Body>) -> impl IntoResponse {
    let path = req.uri().path().trim_start_matches('/');

    // Try the exact path first
    if let Some(content) = Assets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime.as_ref())
            .body(Body::from(content.data.into_owned()))
            .unwrap();
    }

    // Try with .html extension (for Next.js static export)
    let html_path = format!("{}.html", path);
    if let Some(content) = Assets::get(&html_path) {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html")
            .body(Body::from(content.data.into_owned()))
            .unwrap();
    }

    // Try index.html in subdirectory
    let index_path = if path.is_empty() {
        "index.html".to_string()
    } else {
        format!("{}/index.html", path)
    };
    if let Some(content) = Assets::get(&index_path) {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html")
            .body(Body::from(content.data.into_owned()))
            .unwrap();
    }

    // Fallback to root index.html for SPA client-side routing
    if let Some(content) = Assets::get("index.html") {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html")
            .body(Body::from(content.data.into_owned()))
            .unwrap();
    }

    // 404 if nothing found
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Body::from("Not Found"))
        .unwrap()
}

#[tokio::main]
async fn main() {
    // Initialize tracing subscriber for logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set tracing subscriber");

    // Parse port from environment variable, default to 3008
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3008);

    // Configure CORS for development
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Initialize the database
    let database = Arc::new(
        db::Database::new().expect("Failed to initialize database"),
    );
    info!("Database initialized");

    // Build the router
    let app = Router::new()
        .route("/api/health", get(routes::health))
        .nest("/api", routes::project_routes().with_state(database))
        .route("/api/beads", get(routes::beads::read_beads))
        .route("/api/beads/comment", post(routes::beads::add_comment))
        .route("/api/fs/list", get(routes::fs::list_directory))
        .route("/api/fs/exists", get(routes::fs::path_exists))
        .route("/api/fs/read", get(routes::fs::read_file))
        .route("/api/fs/open-external", post(routes::fs::open_external))
        .route("/api/bd/command", post(routes::cli::bd_command))
        .route("/api/git/branch-status", get(routes::git::branch_status))
        // Worktree endpoints
        .route("/api/git/worktree-status", get(routes::worktree::worktree_status))
        .route("/api/git/worktree", post(routes::worktree::create_worktree))
        .route("/api/git/worktree", delete(routes::worktree::delete_worktree))
        .route("/api/git/worktrees", get(routes::worktree::list_worktrees))
        // PR endpoints
        .route("/api/git/pr-status", get(routes::worktree::pr_status))
        .route("/api/git/create-pr", post(routes::worktree::create_pr))
        .route("/api/git/merge-pr", post(routes::worktree::merge_pr))
        .route("/api/git/rebase-siblings", post(routes::worktree::rebase_siblings))
        .route("/api/watch/beads", get(routes::watch_beads))
        .fallback(serve_static)
        .layer(cors);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to address");

    info!("Server starting on http://localhost:{}", port);

    // Open default browser
    if let Err(e) = open::that(format!("http://localhost:{}", port)) {
        tracing::warn!("Failed to open browser: {}", e);
    }

    // Start the server
    axum::serve(listener, app)
        .await
        .expect("Server failed to start");
}
