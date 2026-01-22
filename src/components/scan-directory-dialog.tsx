"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Folder, Check, Loader2 } from "lucide-react";

interface ScannedProject {
  name: string;
  path: string;
  selected: boolean;
}

interface ScanDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProjects: (projects: { name: string; path: string }[]) => Promise<void>;
}

type Step = "select" | "results" | "confirm";

export function ScanDirectoryDialog({
  open: isOpen,
  onOpenChange,
  onAddProjects,
}: ScanDirectoryDialogProps) {
  const [step, setStep] = useState<Step>("select");
  const [selectedDirectory, setSelectedDirectory] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [scannedProjects, setScannedProjects] = useState<ScannedProject[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();

  const resetState = useCallback(() => {
    setStep("select");
    setSelectedDirectory("");
    setScannedProjects([]);
    setIsScanning(false);
    setIsAdding(false);
    setShowConfirmDialog(false);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetState();
      }
      onOpenChange(open);
    },
    [onOpenChange, resetState]
  );

  const scanDirectory = useCallback(async () => {
    if (!selectedDirectory) return;

    setIsScanning(true);
    try {
      const { entries } = await api.fs.list(selectedDirectory);
      const dirs = entries.filter((e) => e.isDirectory);

      // Check each subdirectory for .beads folder in parallel
      const projectResults = await Promise.all(
        dirs.map(async (dir) => {
          const result = await api.fs.exists(`${dir.path}/.beads`);
          return {
            name: dir.name,
            path: dir.path,
            hasBeads: result.exists,
          };
        })
      );

      // Filter to only directories with .beads
      const projectsFound = projectResults
        .filter((p) => p.hasBeads)
        .map((p) => ({
          name: p.name,
          path: p.path,
          selected: true, // All selected by default
        }));

      setScannedProjects(projectsFound);
      setStep("results");

      if (projectsFound.length === 0) {
        toast({
          title: "No projects found",
          description: "No beads projects found in subdirectories.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error scanning directory:", err);
      toast({
        title: "Scan failed",
        description:
          err instanceof Error ? err.message : "Failed to scan directory.",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  }, [selectedDirectory, toast]);

  const toggleProject = useCallback((path: string) => {
    setScannedProjects((prev) =>
      prev.map((p) => (p.path === path ? { ...p, selected: !p.selected } : p))
    );
  }, []);

  const toggleAll = useCallback(() => {
    const allSelected = scannedProjects.every((p) => p.selected);
    setScannedProjects((prev) =>
      prev.map((p) => ({ ...p, selected: !allSelected }))
    );
  }, [scannedProjects]);

  const selectedCount = scannedProjects.filter((p) => p.selected).length;

  const handleAddProjects = useCallback(async () => {
    const projectsToAdd = scannedProjects
      .filter((p) => p.selected)
      .map(({ name, path }) => ({ name, path }));

    if (projectsToAdd.length === 0) return;

    setIsAdding(true);
    setShowConfirmDialog(false);

    try {
      await onAddProjects(projectsToAdd);
      toast({
        title: "Projects added",
        description: `Successfully added ${projectsToAdd.length} project${projectsToAdd.length > 1 ? "s" : ""}.`,
      });
      handleOpenChange(false);
    } catch (err) {
      console.error("Error adding projects:", err);
      toast({
        title: "Error",
        description: "Failed to add some projects. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  }, [scannedProjects, onAddProjects, toast, handleOpenChange]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Scan for Projects</DialogTitle>
            <DialogDescription>
              {step === "select"
                ? "Select a parent directory to scan for beads projects."
                : `Found ${scannedProjects.length} project${scannedProjects.length !== 1 ? "s" : ""} in subdirectories.`}
            </DialogDescription>
          </DialogHeader>

          {step === "select" && (
            <div className="flex flex-col gap-4 py-4">
              <div className="space-y-2">
                <label htmlFor="scan-path" className="text-sm font-medium text-zinc-300">
                  Parent Directory
                </label>
                <div className="relative">
                  <Folder className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                  <Input
                    id="scan-path"
                    value={selectedDirectory}
                    onChange={(e) => setSelectedDirectory(e.target.value)}
                    placeholder="/path/to/parent/directory"
                    className="pl-10"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  Enter a directory path to scan its subdirectories for beads projects.
                </p>
              </div>

              <DialogFooter>
                <Button
                  onClick={scanDirectory}
                  disabled={!selectedDirectory.trim() || isScanning}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Scanning...
                    </>
                  ) : (
                    "Scan for Projects"
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "results" && (
            <div className="flex flex-col gap-4 py-4">
              {scannedProjects.length === 0 ? (
                <div className="rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-8 text-center">
                  <p className="text-zinc-400">
                    No beads projects found in subdirectories.
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Make sure subdirectories have a .beads folder.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Badge variant="info" size="sm">
                      {selectedCount} of {scannedProjects.length} selected
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleAll}
                      className="text-xs"
                    >
                      {scannedProjects.every((p) => p.selected)
                        ? "Deselect All"
                        : "Select All"}
                    </Button>
                  </div>

                  <ScrollArea className="h-[250px] rounded-md border border-zinc-700 bg-zinc-800/50">
                    <div className="p-2" role="listbox" aria-label="Found projects">
                      {scannedProjects.map((project) => (
                        <button
                          key={project.path}
                          type="button"
                          role="option"
                          aria-selected={project.selected}
                          onClick={() => toggleProject(project.path)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                            project.selected
                              ? "bg-zinc-700 text-zinc-100"
                              : "text-zinc-400 hover:bg-zinc-700/50"
                          )}
                        >
                          <div
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded border",
                              project.selected
                                ? "border-purple-500 bg-purple-500"
                                : "border-zinc-600 bg-transparent"
                            )}
                          >
                            {project.selected && (
                              <Check className="size-3 text-white" />
                            )}
                          </div>
                          <Folder
                            className={cn(
                              "size-4 shrink-0",
                              project.selected
                                ? "text-purple-400"
                                : "text-zinc-500"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {project.name}
                            </p>
                            <p className="truncate text-xs text-zinc-500">
                              {project.path}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setStep("select")}>
                  Back
                </Button>
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={selectedCount === 0}
                >
                  Add {selectedCount} Project{selectedCount !== 1 ? "s" : ""}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Add {selectedCount} Project{selectedCount !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div>
                <p className="mb-3">
                  The following projects will be added to your dashboard:
                </p>
                <ScrollArea className="max-h-[150px] rounded-md border border-zinc-700 bg-zinc-800/50">
                  <ul className="p-2 text-sm text-zinc-300">
                    {scannedProjects
                      .filter((p) => p.selected)
                      .map((project) => (
                        <li
                          key={project.path}
                          className="flex items-center gap-2 py-1"
                        >
                          <Folder className="size-3 shrink-0 text-purple-400" />
                          <span className="truncate">{project.name}</span>
                        </li>
                      ))}
                  </ul>
                </ScrollArea>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={isAdding}>Cancel</Button>} />
            <Button onClick={handleAddProjects} disabled={isAdding}>
              {isAdding ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Adding…
                </>
              ) : (
                "Add All"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
