"use client";

import { useState, useRef, useEffect } from "react";

import { Pencil, Check, X, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { updateProject } from "@/lib/db";

/**
 * Converts kebab-case, snake_case, camelCase to Title Case with spaces
 */
function formatProjectName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')  // Replace hyphens and underscores with spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space before capitals in camelCase
    .replace(/\b\w/g, c => c.toUpperCase());  // Capitalize first letter of each word
}

interface EditableProjectNameProps {
  projectId: string;
  initialName: string;
  onNameUpdated: () => void;
}

/**
 * Editable project name component with popover for inline editing
 */
export function EditableProjectName({
  projectId,
  initialName,
  onNameUpdated,
}: EditableProjectNameProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Reset name when popover opens
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      // Focus input after popover opens
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isOpen, initialName]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      toast({
        title: "Invalid name",
        description: "Project name cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    if (trimmedName === initialName) {
      setIsOpen(false);
      return;
    }

    setIsSubmitting(true);

    try {
      await updateProject({ id: projectId, name: trimmedName });

      toast({
        title: "Project renamed",
        description: `Project has been renamed to "${trimmedName}".`,
      });

      setIsOpen(false);
      onNameUpdated();
    } catch (err) {
      console.error("Error updating project name:", err);
      toast({
        title: "Error",
        description: "Failed to update project name. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setName(initialName);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-lg font-semibold text-zinc-100">{formatProjectName(initialName)}</h1>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Edit project name"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="project-name"
                  className="text-sm font-medium text-foreground"
                >
                  Project Name
                </label>
                <Input
                  ref={inputRef}
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter project name"
                  disabled={isSubmitting}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !name.trim()}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
