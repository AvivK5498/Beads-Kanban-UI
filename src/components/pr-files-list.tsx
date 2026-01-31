"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PRFileEntry } from "@/types";

/**
 * Map file status to a single-letter abbreviation and color classes.
 */
function getStatusDisplay(status: PRFileEntry["status"]): {
  letter: string;
  className: string;
} {
  switch (status) {
    case "modified":
    case "changed":
      return { letter: "M", className: "text-zinc-400 bg-zinc-400/10" };
    case "added":
    case "copied":
      return { letter: "A", className: "text-green-400 bg-green-400/10" };
    case "removed":
      return { letter: "D", className: "text-red-400 bg-red-400/10" };
    case "renamed":
      return { letter: "R", className: "text-amber-400 bg-amber-400/10" };
    case "unchanged":
      return { letter: "U", className: "text-zinc-500 bg-zinc-500/10" };
    default:
      return { letter: "?", className: "text-zinc-500 bg-zinc-500/10" };
  }
}

/**
 * Extract basename from a full file path.
 */
function basename(filepath: string): string {
  const parts = filepath.split("/");
  return parts[parts.length - 1] || filepath;
}

export interface PRFilesListProps {
  files: PRFileEntry[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

/**
 * Displays a list of changed files in a PR with status indicators
 * and addition/deletion counts.
 */
export function PRFilesList({
  files,
  totalAdditions,
  totalDeletions,
  totalFiles,
}: PRFilesListProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" role="region" aria-label="Pull request changed files">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          Files Changed ({totalFiles})
        </span>
        <span className="text-xs tabular-nums text-zinc-500">
          {totalAdditions > 0 && (
            <span className="text-green-400">+{totalAdditions}</span>
          )}
          {totalAdditions > 0 && totalDeletions > 0 && " "}
          {totalDeletions > 0 && (
            <span className="text-red-400">-{totalDeletions}</span>
          )}
        </span>
      </div>

      {/* File list */}
      <ScrollArea className="max-h-[200px]">
        <div className="space-y-0.5">
          <TooltipProvider delayDuration={300}>
            {files.map((file) => {
              const statusDisplay = getStatusDisplay(file.status);
              const name = basename(file.filename);
              const showTooltip = name !== file.filename;

              return (
                <div
                  key={file.filename}
                  className="flex items-center gap-2 px-1.5 py-1 rounded text-xs hover:bg-zinc-800/50"
                >
                  {/* Status letter badge */}
                  <span
                    className={cn(
                      "flex-shrink-0 size-5 flex items-center justify-center rounded text-[10px] font-medium",
                      statusDisplay.className
                    )}
                    aria-label={file.status}
                  >
                    {statusDisplay.letter}
                  </span>

                  {/* Filename with optional tooltip for full path */}
                  {showTooltip ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex-1 min-w-0 truncate text-zinc-300 cursor-default">
                          {name}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <span className="font-mono text-xs break-all">
                          {file.filename}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="flex-1 min-w-0 truncate text-zinc-300">
                      {name}
                    </span>
                  )}

                  {/* Addition/deletion counts */}
                  <span className="flex-shrink-0 tabular-nums text-[11px] text-right">
                    {file.additions > 0 && (
                      <span className="text-green-400">+{file.additions}</span>
                    )}
                    {file.additions > 0 && file.deletions > 0 && " "}
                    {file.deletions > 0 && (
                      <span className="text-red-400">-{file.deletions}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </TooltipProvider>
        </div>
      </ScrollArea>
    </div>
  );
}
