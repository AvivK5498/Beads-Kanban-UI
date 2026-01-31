"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { ExternalLink, Code, FolderOpen, Loader2 } from "lucide-react";

import { StatusDonut } from "@/components/status-donut";
import { TagPicker } from "@/components/tag-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoiuiCard } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import type { Tag } from "@/lib/db";
import type { BeadCounts } from "@/types";

/**
 * Converts kebab-case, snake_case, camelCase to Title Case with spaces
 */
function formatProjectName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')  // Replace hyphens and underscores with spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space before capitals in camelCase
    .replace(/\b\w/g, c => c.toUpperCase());  // Capitalize first letter of each word
}

interface ProjectCardProps {
  id: string;
  name: string;
  path: string;
  tags: Tag[];
  beadCounts?: BeadCounts;
  onTagsChange?: (tags: Tag[]) => void;
}

export function ProjectCard({
  id,
  name,
  path,
  tags,
  beadCounts = { open: 0, in_progress: 0, inreview: 0, closed: 0 },
  onTagsChange,
}: ProjectCardProps) {
  const router = useRouter();
  const [isOpening, setIsOpening] = useState<string | null>(null);
  const { toast } = useToast();

  const handleOpenExternal = async (target: 'vscode' | 'cursor' | 'finder', e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpening(target);

    try {
      await api.fs.openExternal(path, target);
      toast({
        title: "Opening project",
        description: target === 'finder'
          ? "Opening in Finder..."
          : `Opening in ${target === 'vscode' ? 'VS Code' : 'Cursor'}...`,
      });
    } catch (err) {
      console.error("Error opening project:", err);
      toast({
        title: "Failed to open",
        description: err instanceof Error ? err.message : "Could not open the project. Make sure the application is installed.",
        variant: "destructive",
      });
    } finally {
      setIsOpening(null);
    }
  };

  const handleCardClick = () => {
    router.push(`/project?id=${id}`);
  };

  return (
    <RoiuiCard
      className="cursor-pointer flex flex-col min-h-[155px]"
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      aria-label={`View ${formatProjectName(name)} project`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      {/* Top row: Donut left, Tags right */}
      <div className="flex items-start justify-between">
        <StatusDonut beadCounts={beadCounts} size={36} />
        <div
          className="flex flex-wrap items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              size="sm"
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
                borderColor: tag.color,
              }}
            >
              {tag.name}
            </Badge>
          ))}
          {onTagsChange && (
            <TagPicker
              projectId={id}
              projectTags={tags}
              onTagsChange={onTagsChange}
            />
          )}
        </div>
      </div>

      {/* Middle: Title (grows to fill space) */}
      <div className="flex-1 flex items-center">
        <h3 className="text-xl font-medium text-balance font-project-name">
          {formatProjectName(name)}
        </h3>
      </div>

      {/* Bottom row: Path left, Open In button right (aligned) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-500 truncate min-w-0 flex-1" title={path}>
          {path}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              mode="icon"
              className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Open in external application"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => handleOpenExternal('vscode', e)}
              disabled={isOpening !== null}
            >
              {isOpening === 'vscode' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Code className="h-4 w-4" aria-hidden="true" />
              )}
              VS Code
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => handleOpenExternal('cursor', e)}
              disabled={isOpening !== null}
            >
              {isOpening === 'cursor' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Code className="h-4 w-4" aria-hidden="true" />
              )}
              Cursor
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => handleOpenExternal('finder', e)}
              disabled={isOpening !== null}
            >
              {isOpening === 'finder' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
              )}
              Finder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </RoiuiCard>
  );
}
