"use client";

import { FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { designDocProseClasses } from "@/lib/design-doc";
import "highlight.js/styles/github-dark.css";

export interface DesignDocDialogProps {
  /** Whether dialog is open */
  open: boolean;
  /** Callback when dialog state changes */
  onOpenChange: (open: boolean) => void;
  /** Markdown content to display */
  content: string;
  /** Epic ID for display in title */
  epicId: string;
}

/**
 * Full-screen design document dialog with markdown rendering
 * Shows complete design doc at 60% viewport width with syntax highlighting
 */
export function DesignDocDialog({
  open,
  onOpenChange,
  content,
  epicId,
}: DesignDocDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[60vw] max-w-[60vw] max-h-[80vh] p-0 bg-zinc-900 border-zinc-800">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <DialogTitle className="text-base font-semibold">
              Design Document - {epicId}
            </DialogTitle>
          </div>
        </DialogHeader>
        <ScrollArea className="h-[calc(80vh-5rem)]">
          <div className={`p-6 ${designDocProseClasses}`}>
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
              {content}
            </ReactMarkdown>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
