"use client";

import { useState, useEffect } from "react";

import { Loader2, FileText, AlertCircle } from "lucide-react";

import { DesignDocDialog } from "@/components/design-doc-dialog";
import { Button } from "@/components/ui/button";
import { fetchDesignDoc, truncateMarkdownToPlainText } from "@/lib/design-doc";

export interface DesignDocPreviewProps {
  /** Path to design doc (e.g., ".designs/BD-001.md") */
  designDocPath: string;
  /** Epic ID for display */
  epicId: string;
  /** Project root path (absolute) */
  projectPath: string;
}

/**
 * Design doc preview component with collapsible preview and full document dialog
 * Shows truncated plain text preview (~180 chars) with "View Full Document" button
 */
export function DesignDocPreview({
  designDocPath,
  epicId,
  projectPath,
}: DesignDocPreviewProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const loadDoc = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const docContent = await fetchDesignDoc(designDocPath, projectPath);
        setContent(docContent);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load design doc");
      } finally {
        setIsLoading(false);
      }
    };

    void loadDoc();
  }, [designDocPath, projectPath]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        <span>Loading design document…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive text-xs py-2">
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  const preview = truncateMarkdownToPlainText(content, 180);

  return (
    <>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {preview}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setIsDialogOpen(true);
          }}
          className="text-xs h-7"
        >
          <FileText className="h-3 w-3 mr-1.5" aria-hidden="true" />
          View Full Document
        </Button>
      </div>

      <DesignDocDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        content={content}
        epicId={epicId}
      />
    </>
  );
}
