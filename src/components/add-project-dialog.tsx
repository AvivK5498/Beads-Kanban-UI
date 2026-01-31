"use client";

import { useState } from "react";

import { Folder, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import type { CreateProjectInput } from "@/lib/db";


interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProject: (input: CreateProjectInput) => Promise<void>;
}

export function AddProjectDialog({
  open: isOpen,
  onOpenChange,
  onAddProject,
}: AddProjectDialogProps) {
  const [projectPath, setProjectPath] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [showNameInput, setShowNameInput] = useState(false);
  const { toast } = useToast();

  const resetState = () => {
    setProjectPath("");
    setProjectName("");
    setPathError(null);
    setShowNameInput(false);
    setIsValidating(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetState();
    }
    onOpenChange(open);
  };

  const validateAndProceed = async () => {
    if (!projectPath.trim()) {
      setPathError("Please enter a project path.");
      return;
    }

    setIsValidating(true);
    setPathError(null);

    try {
      const cleanPath = projectPath.trim().replace(/\/+$/, "");
      const result = await api.fs.exists(`${cleanPath}/.beads`);

      if (!result.exists) {
        setPathError("No .beads folder found. Run `bd init` in your project first.");
        toast({
          title: "No .beads folder found",
          description: "Run `bd init` in your project first.",
          variant: "destructive",
        });
        return;
      }

      // Extract folder name as default project name
      const pathParts = cleanPath.split(/[/\\]/);
      const defaultName = pathParts[pathParts.length - 1] || "Untitled Project";

      setProjectPath(cleanPath);
      setProjectName(defaultName);
      setShowNameInput(true);
    } catch (err) {
      console.error("Error validating path:", err);
      setPathError("Could not access the specified path. Please check it exists.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectPath || !projectName.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onAddProject({
        name: projectName.trim(),
        path: projectPath,
      });

      toast({
        title: "Project added",
        description: `"${projectName}" has been added successfully.`,
      });

      resetState();
      onOpenChange(false);
    } catch (err) {
      console.error("Error adding project:", err);
      toast({
        title: "Error",
        description: "Failed to add project. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Project</DialogTitle>
          <DialogDescription>
            {showNameInput
              ? "Give your project a name."
              : "Enter the path to a folder containing a beads project."}
          </DialogDescription>
        </DialogHeader>

        {!showNameInput ? (
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="path" className="text-sm font-medium text-zinc-300">
                Project Path
              </label>
              <div className="relative">
                <Folder className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                <Input
                  id="path"
                  value={projectPath}
                  onChange={(e) => {
                    setProjectPath(e.target.value);
                    setPathError(null);
                  }}
                  placeholder="/path/to/your/project"
                  className="pl-10"
                  autoFocus
                />
              </div>
              {pathError && (
                <p className="text-sm text-red-400">{pathError}</p>
              )}
              <p className="text-xs text-zinc-500">
                Enter the full path to your project folder (must contain a .beads folder).
              </p>
            </div>
            <DialogFooter>
              <Button
                onClick={validateAndProceed}
                disabled={!projectPath.trim() || isValidating}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Validating...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-zinc-300">
                  Project Name
                </label>
                <Input
                  id="name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Project"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Location</label>
                <p className="truncate rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-400">
                  {projectPath}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNameInput(false)}
              >
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting || !projectName.trim()}>
                {isSubmitting ? "Adding..." : "Add Project"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
