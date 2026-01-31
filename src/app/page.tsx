"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { Plus, ChevronDown, FolderPlus, FolderSearch, Github, Settings, Search, X } from "lucide-react";

import { AddProjectDialog } from "@/components/add-project-dialog";
import { ProjectCard } from "@/components/project-card";
import { ScanDirectoryDialog } from "@/components/scan-directory-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonArrow } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";

export default function ProjectsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isScanDialogOpen, setIsScanDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { projects, isLoading, error, addProject, updateProjectTags } = useProjects();
  const { toast } = useToast();

  // Get all unique tags across projects
  const allTags = useMemo(() => {
    const tagMap = new Map<string, { id: string; name: string; color: string }>();
    projects.forEach((project) => {
      project.tags.forEach((tag) => {
        if (!tagMap.has(tag.id)) {
          tagMap.set(tag.id, tag);
        }
      });
    });
    return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  // Filter projects by search query and selected tags (AND logic)
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      // Search filter - match name or path
      const searchLower = searchQuery.toLowerCase().trim();
      const matchesSearch = searchLower === "" ||
        project.name.toLowerCase().includes(searchLower) ||
        project.path.toLowerCase().includes(searchLower);

      // Tag filter - AND logic: project must have ALL selected tags
      const matchesTags = selectedTagIds.length === 0 ||
        selectedTagIds.every((tagId) =>
          project.tags.some((tag) => tag.id === tagId)
        );

      return matchesSearch && matchesTags;
    });
  }, [projects, searchQuery, selectedTagIds]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTagIds([]);
  };

  const hasActiveFilters = searchQuery.trim() !== "" || selectedTagIds.length > 0;

  const handleAddProject = async (input: { name: string; path: string }) => {
    // Check for duplicate
    const isDuplicate = projects.some(p => p.path === input.path);
    if (isDuplicate) {
      toast({
        title: "Project already exists",
        description: "This project is already in your dashboard.",
        variant: "destructive",
      });
      throw new Error("Project already exists"); // Let the dialog know it failed
    }
    await addProject(input);
  };

  const handleAddMultipleProjects = async (projectsToAdd: { name: string; path: string }[]) => {
    // Filter out projects that already exist
    const existingPaths = new Set(projects.map(p => p.path));
    const newProjects = projectsToAdd.filter(p => !existingPaths.has(p.path));
    const duplicateCount = projectsToAdd.length - newProjects.length;

    // If all are duplicates, show error
    if (newProjects.length === 0) {
      toast({
        title: "All projects already exist",
        description: `${duplicateCount === 1 ? "This project is" : "All " + duplicateCount + " projects are"} already in your dashboard.`,
        variant: "destructive",
      });
      throw new Error("All projects already exist");
    }

    // Add new projects
    for (const project of newProjects) {
      await addProject(project);
    }

    // If some were duplicates, notify the user
    if (duplicateCount > 0) {
      toast({
        title: "Some projects skipped",
        description: `${duplicateCount} duplicate project${duplicateCount > 1 ? "s were" : " was"} skipped.`,
      });
    }
  };

  return (
    <div className="dark flex min-h-dvh flex-col bg-[#0a0a0a]">
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0a0a0a]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1200px] items-center justify-center px-6 py-2">
          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-md p-2 text-zinc-400 transition-colors duration-150 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </nav>

      {/* Hero Section - pushed down with padding */}
      <main className="flex flex-col items-center px-6 pt-32">
        {/* Centered Heading with Space Grotesk */}
        <h1 className="mb-4 text-center text-balance font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Manage Your Beads Projects
        </h1>
        <p className="text-center text-zinc-400 text-sm mb-8">
          Highly recommended to use with the{" "}
          <a
            href="https://github.com/AvivK5498/Claude-Code-Beads-Orchestration"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Beads Orchestration Skill
          </a>
        </p>

        <div className="w-full max-w-[1200px]">
          {/* Add Project Dropdown */}
          <div className="mb-6 flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="mono" size="md">
                  <Plus aria-hidden="true" />
                  Add Project
                  <ButtonArrow icon={ChevronDown} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setIsAddDialogOpen(true)}>
                  <FolderPlus aria-hidden="true" />
                  Add Project
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsScanDialogOpen(true)}>
                  <FolderSearch aria-hidden="true" />
                  Scan Directory
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Search and Filter Bar */}
          {projects.length > 0 && (
            <div className="mb-6 space-y-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-zinc-900/50 border-zinc-700"
                  aria-label="Search projects"
                />
              </div>

              {/* Tag Filter Chips */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500">Filter by tag:</span>
                  {allTags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className="transition-opacity"
                        aria-pressed={isSelected}
                        aria-label={`Filter by ${tag.name}`}
                      >
                        <Badge
                          variant={isSelected ? "primary" : "outline"}
                          size="sm"
                          style={
                            isSelected
                              ? {
                                  backgroundColor: tag.color,
                                  color: "#fff",
                                  borderColor: tag.color,
                                }
                              : {
                                  backgroundColor: `${tag.color}10`,
                                  color: tag.color,
                                  borderColor: `${tag.color}50`,
                                }
                          }
                        >
                          {tag.name}
                        </Badge>
                      </button>
                    );
                  })}
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="ml-2 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      aria-label="Clear all filters"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Results count when filtering */}
              {hasActiveFilters && (
                <p className="text-xs text-zinc-500">
                  Showing {filteredProjects.length} of {projects.length} project{projects.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          {isLoading ? (
            <div role="status" aria-label="Loading projects" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                  <div className="mb-3 flex gap-1.5">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="mt-2 h-4 w-48" />
                  <Skeleton className="mt-4 h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div role="alert" className="rounded-lg border border-red-800/50 bg-red-950/70 p-6 text-center">
              <p className="text-red-400">Error loading projects: {error.message}</p>
              <p className="mt-2 text-sm text-red-500">
                Make sure the Tauri backend is running.
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/70 p-6 text-center text-zinc-400">
                {hasActiveFilters ? (
                  <>
                    <p>No matching projects</p>
                    <p className="mt-1 text-sm text-zinc-500">Try adjusting your search or filters</p>
                  </>
                ) : (
                  <>
                    <p>No projects yet</p>
                    <p className="mt-1 text-sm text-zinc-500">Click the Add Project button above to get started</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  id={project.id}
                  name={project.name}
                  path={project.path}
                  tags={project.tags}
                  beadCounts={project.beadCounts}
                  onTagsChange={(tags) => updateProjectTags(project.id, tags)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-zinc-800 py-3">
        <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-4 px-6">
          <a
            href="https://github.com/AvivK5498/beads-kanban-ui"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            <span>Beads Kanban UI</span>
          </a>
          <span className="text-zinc-600" aria-hidden="true">·</span>
          <a
            href="https://github.com/steveyegge/beads"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            <span>Beads CLI</span>
          </a>
        </div>
      </footer>

      {/* Add Project Dialog */}
      <AddProjectDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddProject={handleAddProject}
      />

      {/* Scan Directory Dialog */}
      <ScanDirectoryDialog
        open={isScanDialogOpen}
        onOpenChange={setIsScanDialogOpen}
        onAddProjects={handleAddMultipleProjects}
      />
    </div>
  );
}
