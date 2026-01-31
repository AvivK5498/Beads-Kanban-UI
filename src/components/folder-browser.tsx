"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { Folder, FolderOpen, ChevronRight, Home } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as api from "@/lib/api";
import type { FsEntry } from "@/lib/api";
import { cn } from "@/lib/utils";


interface FolderBrowserProps {
  currentPath: string;
  onPathChange: (path: string) => void;
  onSelectPath: (path: string, hasBeads: boolean) => void;
  className?: string;
}

interface DirectoryEntry extends FsEntry {
  hasBeads: boolean;
}

export function FolderBrowser({
  currentPath,
  onPathChange,
  onSelectPath,
  className,
}: FolderBrowserProps) {
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [currentPathHasBeads, setCurrentPathHasBeads] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Load directories when path changes
  useEffect(() => {
    const loadDirectories = async () => {
      if (!currentPath) return;

      setLoading(true);
      setError(null);
      setSelectedIndex(-1);

      try {
        // Fetch directory contents and check if current path has beads in parallel
        const [listResult, currentBeadsResult] = await Promise.all([
          api.fs.list(currentPath),
          api.fs.exists(`${currentPath.replace(/\/+$/, "")}/.beads`),
        ]);

        // Filter to only directories
        const dirs = listResult.entries.filter((entry) => entry.isDirectory);

        // Check which directories have .beads folders in parallel
        const dirsWithBeadsStatus = await Promise.all(
          dirs.map(async (dir) => {
            const beadsPath = `${dir.path}/.beads`;
            const result = await api.fs.exists(beadsPath);
            return {
              ...dir,
              hasBeads: result.exists,
            };
          })
        );

        // Sort: directories with .beads first, then alphabetically
        dirsWithBeadsStatus.sort((a, b) => {
          if (a.hasBeads && !b.hasBeads) return -1;
          if (!a.hasBeads && b.hasBeads) return 1;
          return a.name.localeCompare(b.name);
        });

        setDirectories(dirsWithBeadsStatus);
        setCurrentPathHasBeads(currentBeadsResult.exists);
      } catch (err) {
        console.error("Error loading directories:", err);
        setError(err instanceof Error ? err.message : "Failed to load directories");
        setDirectories([]);
      } finally {
        setLoading(false);
      }
    };

    loadDirectories();
  }, [currentPath]);

  const navigateToDirectory = useCallback(
    (path: string) => {
      onPathChange(path);
    },
    [onPathChange]
  );

  const navigateUp = useCallback(() => {
    const parentPath = currentPath.replace(/\/[^/]+\/?$/, "") || "/";
    onPathChange(parentPath);
  }, [currentPath, onPathChange]);

  const navigateToHome = useCallback(() => {
    // Get home directory - on macOS/Linux it's typically /Users/username or /home/username
    const homePath =
      typeof window !== "undefined"
        ? "/Users" // Start at /Users on macOS for navigation
        : "/";
    onPathChange(homePath);
  }, [onPathChange]);

  // Build breadcrumb segments from current path
  const pathSegments = currentPath.split("/").filter(Boolean);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (directories.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < directories.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < directories.length) {
            navigateToDirectory(directories[selectedIndex].path);
          }
          break;
        case "Backspace":
          if (currentPath !== "/") {
            e.preventDefault();
            navigateUp();
          }
          break;
      }
    },
    [directories, selectedIndex, navigateToDirectory, navigateUp, currentPath]
  );

  const handleSelect = useCallback(() => {
    onSelectPath(currentPath, currentPathHasBeads);
  }, [currentPath, currentPathHasBeads, onSelectPath]);

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Folder browser"
    >
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/50 px-2 py-1.5 text-sm">
        <Button
          variant="ghost"
          size="xs"
          mode="icon"
          onClick={navigateToHome}
          aria-label="Go to home directory"
          className="shrink-0"
        >
          <Home />
        </Button>
        <ChevronRight className="size-3 shrink-0 text-zinc-500" />
        {pathSegments.map((segment, index) => {
          const segmentPath = "/" + pathSegments.slice(0, index + 1).join("/");
          const isLast = index === pathSegments.length - 1;

          return (
            <div key={segmentPath} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => navigateToDirectory(segmentPath)}
                className={cn(
                  "rounded px-1 py-0.5 text-sm transition-colors hover:bg-zinc-700",
                  isLast ? "text-zinc-100" : "text-zinc-400"
                )}
              >
                {segment}
              </button>
              {!isLast && (
                <ChevronRight className="size-3 shrink-0 text-zinc-500" />
              )}
            </div>
          );
        })}
      </div>

      {/* Current path beads indicator */}
      {currentPathHasBeads && (
        <div className="flex items-center gap-2 rounded-md border border-purple-500/30 bg-purple-500/10 px-3 py-2">
          <Badge variant="info" size="sm">
            .beads found
          </Badge>
          <span className="text-xs text-zinc-400">
            This folder contains a beads project
          </span>
        </div>
      )}

      {/* Directory list */}
      <ScrollArea className="h-[300px] rounded-md border border-zinc-700 bg-zinc-800/50">
        <div ref={listRef} className="p-2" role="listbox" aria-label="Directories">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500">
              <div className="size-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
              <span className="ml-2 text-sm">Loading...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-red-400">{error}</div>
          ) : directories.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              No subdirectories found
            </div>
          ) : (
            directories.map((dir, index) => (
              <button
                key={dir.path}
                type="button"
                role="option"
                aria-selected={selectedIndex === index}
                onClick={() => setSelectedIndex(index)}
                onDoubleClick={() => navigateToDirectory(dir.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  selectedIndex === index
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-300 hover:bg-zinc-700/50",
                  dir.hasBeads && "border-l-2 border-purple-500"
                )}
              >
                {selectedIndex === index ? (
                  <FolderOpen className="size-4 shrink-0 text-zinc-400" />
                ) : (
                  <Folder
                    className={cn(
                      "size-4 shrink-0",
                      dir.hasBeads ? "text-purple-400" : "text-zinc-400"
                    )}
                  />
                )}
                <span className="truncate">{dir.name}</span>
                {dir.hasBeads && (
                  <Badge variant="info" size="xs" className="ml-auto shrink-0">
                    .beads
                  </Badge>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Keyboard hints */}
      <div className="text-xs text-zinc-500">
        Double-click or press Enter to open. Backspace to go up.
      </div>

      {/* Select button */}
      <Button
        onClick={handleSelect}
        disabled={!currentPath || loading}
        className="w-full"
      >
        Select This Folder
      </Button>
    </div>
  );
}
