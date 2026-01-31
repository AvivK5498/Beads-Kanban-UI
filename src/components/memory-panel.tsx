"use client";

import { useState, useCallback } from "react";

import {
  BrainCircuit,
  Pencil,
  Tag,
  ExternalLink,
  Archive,
  Trash2,
  Search,
  MoreVertical,
  X,
  Loader2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemory } from "@/hooks/use-memory";
import { cn } from "@/lib/utils";
import type { MemoryEntry, MemoryType } from "@/types";

export interface MemoryPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Absolute path to the project root */
  projectPath: string;
  /** Callback to navigate to a bead by ID */
  onNavigateToBead?: (beadId: string) => void;
}

type TabFilter = "all" | "learned" | "investigation";

/**
 * Format a unix timestamp to a relative time string
 */
function formatRelativeTime(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;

  if (diff < 60) return "just now";
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins}m ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days}d ago`;
  }
  const date = new Date(ts * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a memory entry's bead ID to a short display form.
 * Handles IDs like "beads-kanban-ui-t25.2" -> "BD-t25.2"
 * or "project-p02" -> "BD-p02"
 */
function formatMemoryBeadId(id: string): string {
  if (id.startsWith("BD-") || id.startsWith("bd-")) {
    return id.length > 10 ? `BD-${id.slice(-6)}` : id.toUpperCase();
  }
  // Extract the part after the last hyphen (handles dots for epic children)
  const lastDash = id.lastIndexOf("-");
  if (lastDash !== -1) {
    return `BD-${id.slice(lastDash + 1)}`;
  }
  return `BD-${id.slice(0, 6)}`;
}

/**
 * Single memory entry card
 */
function MemoryEntryCard({
  entry,
  onEdit,
  onArchive,
  onDelete,
  onNavigate,
}: {
  entry: MemoryEntry;
  onEdit: (entry: MemoryEntry) => void;
  onArchive: (key: string) => void;
  onDelete: (key: string) => void;
  onNavigate?: (beadId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2 overflow-hidden">
      {/* Top row: type badge, timestamp */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {entry.type === "learned" ? (
            <Badge variant="info" appearance="light" size="xs">
              LEARN
            </Badge>
          ) : (
            <Badge variant="success" appearance="light" size="xs">
              INVES
            </Badge>
          )}
        </div>
        <time
          dateTime={new Date(entry.ts * 1000).toISOString()}
          className="text-xs text-zinc-600 shrink-0 tabular-nums"
        >
          {formatRelativeTime(entry.ts)}
        </time>
      </div>

      {/* Content preview */}
      <p className="text-sm text-zinc-300 line-clamp-3 text-pretty">
        {entry.content}
      </p>

      {/* Bottom row: tags, bead link, actions menu */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {entry.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              appearance="light"
              size="xs"
              className="text-zinc-500"
            >
              {tag}
            </Badge>
          ))}
          {entry.tags.length > 3 && (
            <span className="text-xs text-zinc-600 shrink-0">
              +{entry.tags.length - 3}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {entry.bead && (
            <button
              type="button"
              onClick={() => onNavigate?.(entry.bead)}
              className={cn(
                "text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring truncate max-w-[120px]",
                !onNavigate && "pointer-events-none"
              )}
              title={entry.bead}
              aria-label={`Navigate to bead ${entry.bead}`}
            >
              {formatMemoryBeadId(entry.bead)}
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="size-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Entry actions"
              >
                <MoreVertical className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-zinc-900 border-zinc-800"
            >
              <DropdownMenuItem
                onClick={() => onEdit(entry)}
                className="text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100 gap-2"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Edit content
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onEdit(entry)}
                className="text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100 gap-2"
              >
                <Tag className="size-3.5" aria-hidden="true" />
                Edit tags
              </DropdownMenuItem>
              {entry.bead && onNavigate && (
                <DropdownMenuItem
                  onClick={() => onNavigate(entry.bead)}
                  className="text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100 gap-2"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Navigate to bead
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onClick={() => onArchive(entry.key)}
                className="text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100 gap-2"
              >
                <Archive className="size-3.5" aria-hidden="true" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(entry.key)}
                className="text-red-400 focus:bg-zinc-800 focus:text-red-400 gap-2"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

/**
 * Memory Panel - slide-out Sheet for browsing and managing knowledge base entries
 */
export function MemoryPanel({
  open,
  onOpenChange,
  projectPath,
  onNavigateToBead,
}: MemoryPanelProps) {
  const {
    stats,
    isLoading,
    error,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    filteredEntries,
    editEntry,
    archiveEntry,
    deleteEntry,
  } = useMemory(projectPath);

  // Tab state maps to type filter
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  // Edit dialog state
  const [editingEntry, setEditingEntry] = useState<MemoryEntry | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation state
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * Handle tab change - maps tab value to type filter
   */
  const handleTabChange = useCallback(
    (value: string) => {
      const tabValue = value as TabFilter;
      setActiveTab(tabValue);
      setTypeFilter(tabValue === "all" ? null : (tabValue as MemoryType));
    },
    [setTypeFilter]
  );

  /**
   * Handle navigate to bead
   */
  const handleNavigate = useCallback(
    (beadId: string) => {
      onOpenChange(false);
      onNavigateToBead?.(beadId);
    },
    [onOpenChange, onNavigateToBead]
  );

  /**
   * Open edit dialog for an entry
   */
  const handleEditOpen = useCallback((entry: MemoryEntry) => {
    setEditingEntry(entry);
    setEditContent(entry.content);
    setEditTags(entry.tags.join(", "));
  }, []);

  /**
   * Save edited entry
   */
  const handleEditSave = useCallback(async () => {
    if (!editingEntry) return;
    setIsSaving(true);
    try {
      const newTags = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await editEntry(editingEntry.key, editContent, newTags);
      setEditingEntry(null);
    } catch {
      // Error is logged in hook
    } finally {
      setIsSaving(false);
    }
  }, [editingEntry, editContent, editTags, editEntry]);

  /**
   * Handle archive
   */
  const handleArchive = useCallback(
    async (key: string) => {
      try {
        await archiveEntry(key);
      } catch {
        // Error is logged in hook
      }
    },
    [archiveEntry]
  );

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingKey) return;
    setIsDeleting(true);
    try {
      await deleteEntry(deletingKey);
      setDeletingKey(null);
    } catch {
      // Error is logged in hook
    } finally {
      setIsDeleting(false);
    }
  }, [deletingKey, deleteEntry]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg md:max-w-xl bg-[#0a0a0a] border-zinc-800 flex flex-col"
        >
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-zinc-100">
              <BrainCircuit className="size-5" aria-hidden="true" />
              Memory
            </SheetTitle>
            <SheetDescription className="text-zinc-500">
              {stats
                ? `${stats.total} ${stats.total === 1 ? "entry" : "entries"}`
                : "Loading..."}
            </SheetDescription>
          </SheetHeader>

          {/* Search input */}
          <div className="relative mt-4">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500"
              aria-hidden="true"
            />
            <Input
              type="text"
              aria-label="Search memories"
              placeholder="Search memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 h-8 bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-0 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center text-zinc-500 hover:text-zinc-300"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Type filter tabs */}
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="mt-3"
          >
            <TabsList className="h-8 bg-zinc-800/50 p-0.5 w-full">
              <TabsTrigger
                value="all"
                className="h-7 flex-1 text-sm font-medium data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 data-[state=inactive]:text-zinc-400"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                value="learned"
                className="h-7 flex-1 text-sm font-medium data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 data-[state=inactive]:text-zinc-400"
              >
                Learned
              </TabsTrigger>
              <TabsTrigger
                value="investigation"
                className="h-7 flex-1 text-sm font-medium data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 data-[state=inactive]:text-zinc-400"
              >
                Investigation
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Entries list */}
          <ScrollArea className="flex-1 mt-3 -mx-6 px-6">
            <div className="space-y-2 pb-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 text-zinc-500 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Loading memory entries</span>
                </div>
              ) : error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center"
                >
                  <p className="text-sm text-red-400">
                    Failed to load memory entries
                  </p>
                  <p className="text-xs text-red-400/60 mt-1">
                    {error.message}
                  </p>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BrainCircuit
                    className="size-8 text-zinc-700 mb-3"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-zinc-500">
                    {search || typeFilter
                      ? "No entries match your search"
                      : "No memory entries yet"}
                  </p>
                  {(search || typeFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setActiveTab("all");
                        setTypeFilter(null);
                      }}
                      className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                filteredEntries.map((entry) => (
                  <MemoryEntryCard
                    key={entry.key}
                    entry={entry}
                    onEdit={handleEditOpen}
                    onArchive={handleArchive}
                    onDelete={setDeletingKey}
                    onNavigate={onNavigateToBead ? handleNavigate : undefined}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Footer stats */}
          {stats && stats.total > 0 && (
            <SheetFooter className="border-t border-zinc-800 pt-3 -mx-6 px-6">
              <p className="text-xs text-zinc-600 w-full text-center">
                <span className="tabular-nums">{stats.learned}</span> learned
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span className="tabular-nums">{stats.investigation}</span>{" "}
                investigation
                {stats.archived > 0 && (
                  <>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="tabular-nums">{stats.archived}</span>{" "}
                    archived
                  </>
                )}
              </p>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <AlertDialog
        open={!!editingEntry}
        onOpenChange={(isOpen) => !isOpen && setEditingEntry(null)}
      >
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">
              Edit Memory Entry
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-500">
              Update the content or tags for this entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label
                htmlFor="edit-content"
                className="text-sm font-medium text-zinc-300"
              >
                Content
              </label>
              <textarea
                id="edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-32 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="edit-tags"
                className="text-sm font-medium text-zinc-300"
              >
                Tags (comma-separated)
              </label>
              <Input
                id="edit-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                placeholder="tag1, tag2, tag3..."
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost">Cancel</Button>} />
            <Button onClick={handleEditSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="size-4 animate-spin mr-1.5" aria-hidden="true" />
              ) : null}
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingKey}
        onOpenChange={(isOpen) => !isOpen && setDeletingKey(null)}
      >
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">
              Delete Memory Entry
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete this memory entry. This action cannot
              be undone. Consider archiving instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost">Cancel</Button>} />
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin mr-1.5" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4 mr-1.5" aria-hidden="true" />
              )}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
