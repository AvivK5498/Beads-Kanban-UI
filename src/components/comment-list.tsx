"use client";

import { useState } from "react";

import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { beads as beadsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Comment } from "@/types";

export interface CommentListProps {
  comments: Comment[];
  beadId: string;
  projectPath: string;
  onCommentAdded?: () => void;
}

/**
 * Format a date string to relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return dateString;
  }
}

/**
 * Single comment card component
 */
function CommentCard({ comment }: { comment: Comment }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-1.5"
      )}
    >
      {/* Author and timestamp */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-zinc-200">{comment.author}</span>
        <span className="text-zinc-500">
          {formatRelativeTime(comment.created_at)}
        </span>
      </div>

      {/* Comment text */}
      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {comment.text}
      </p>
    </div>
  );
}

/**
 * Comments list component displaying all comments for a bead
 */
export function CommentList({
  comments,
  beadId,
  projectPath,
  onCommentAdded,
}: CommentListProps) {
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Get author from localStorage or use default
      const author = localStorage.getItem("beads-author") || "user";
      await beadsApi.addComment(projectPath, beadId, newComment.trim(), author);
      setNewComment("");
      onCommentAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">
          Comments ({comments.length})
        </h3>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* Comments or empty state */}
      {comments.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4 text-center">
          No comments yet
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
        </div>
      )}

      {/* Add Comment Form */}
      <div className="pt-2 space-y-2">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Add a comment…"
            aria-label="Add a comment"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            className="flex-1"
          />
          <Button
            onClick={handleAddComment}
            disabled={isSubmitting || !newComment.trim()}
            size="sm"
          >
            {isSubmitting ? "Adding…" : "Add"}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}
