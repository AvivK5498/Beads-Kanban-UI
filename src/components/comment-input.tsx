"use client";

import * as React from "react";

import { Loader2, CornerDownLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { addComment } from "@/lib/cli";
import { cn } from "@/lib/utils";

export interface CommentInputProps {
  /** The ID of the bead to add comments to */
  beadId: string;
  /** Optional project path for CLI command execution */
  projectPath?: string;
  /** Callback fired after a comment is successfully added */
  onCommentAdded?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * CommentInput component for adding comments to beads via CLI
 *
 * Features:
 * - Textarea with placeholder
 * - Submit on Enter (Cmd/Ctrl+Enter for newline)
 * - Loading state while submitting
 * - Success/error toasts
 * - Clears input on success
 */
export function CommentInput({
  beadId,
  projectPath,
  onCommentAdded,
  className,
}: CommentInputProps) {
  const [comment, setComment] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleSubmit = React.useCallback(async () => {
    const trimmedComment = comment.trim();

    if (!trimmedComment) {
      return;
    }

    setIsSubmitting(true);

    try {
      await addComment(beadId, trimmedComment, projectPath);

      // Clear input on success
      setComment("");

      // Show success toast
      toast({
        title: "Comment added",
        description: `Comment added to ${beadId}`,
      });

      // Notify parent
      onCommentAdded?.();
    } catch (error) {
      // Show error toast with message
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      toast({
        variant: "destructive",
        title: "Failed to add comment",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
      // Refocus textarea after submission
      textareaRef.current?.focus();
    }
  }, [beadId, comment, projectPath, onCommentAdded]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter (without modifier)
      // Allow Cmd/Ctrl+Enter for newline
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setComment(e.target.value);
    },
    []
  );

  const canSubmit = comment.trim().length > 0 && !isSubmitting;

  return (
    <div className={cn("relative", className)}>
      <textarea
        ref={textareaRef}
        value={comment}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        disabled={isSubmitting}
        rows={1}
        className={cn(
          "flex w-full resize-none rounded-md border border-input bg-transparent",
          "px-3 py-2 pr-12 text-sm shadow-sm transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "min-h-[40px] max-h-[120px]"
        )}
        style={{
          // Auto-resize based on content
          height: "auto",
          minHeight: "40px",
        }}
        onInput={(e) => {
          // Auto-resize textarea
          const target = e.target as HTMLTextAreaElement;
          target.style.height = "auto";
          target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
        }}
      />

      {/* Submit button */}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2",
          "h-8 w-8 transition-opacity",
          canSubmit ? "opacity-100" : "opacity-50"
        )}
        title="Submit comment (Enter)"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CornerDownLeft className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
