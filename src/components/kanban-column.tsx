"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BeadCard } from "@/components/bead-card";
import { EpicCard } from "@/components/epic-card";
import { cn } from "@/lib/utils";
import type { Bead, BeadStatus, Epic } from "@/types";
import type { BranchStatus } from "@/lib/git";

export interface KanbanColumnProps {
  status: BeadStatus;
  title: string;
  beads: Bead[];
  /** All beads for resolving epic children */
  allBeads: Bead[];
  selectedBeadId?: string | null;
  ticketNumbers?: Map<string, number>;
  branchStatuses?: Record<string, BranchStatus>;
  onSelectBead: (bead: Bead) => void;
  onChildClick?: (child: Bead) => void;
  onNavigateToDependency?: (beadId: string) => void;
  /** Project root path for fetching design docs */
  projectPath?: string;
}

/**
 * Get accent border class for column header based on status
 */
function getColumnAccentBorder(status: BeadStatus): string {
  switch (status) {
    case "open":
      return "border-t-2 border-t-blue-500/60";
    case "in_progress":
      return "border-t-2 border-t-amber-500/60";
    case "inreview":
      return "border-t-2 border-t-cyan-500/60";
    case "closed":
      return "border-t-2 border-t-green-500/60";
    default:
      return "border-t-2 border-t-zinc-500/60";
  }
}

/**
 * Get header text color based on status
 */
function getHeaderTextColor(status: BeadStatus): string {
  switch (status) {
    case "open":
      return "text-blue-400";
    case "in_progress":
      return "text-amber-400";
    case "inreview":
      return "text-cyan-400";
    case "closed":
      return "text-green-400";
    default:
      return "text-zinc-400";
  }
}

/**
 * Get badge color class for count badge based on status (dark theme)
 */
function getBadgeVariant(status: BeadStatus): string {
  switch (status) {
    case "open":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/20";
    case "in_progress":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/20";
    case "inreview":
      return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20";
    case "closed":
      return "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/20";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/20";
  }
}

/**
 * Type guard to check if a bead is an epic
 */
function isEpic(bead: Bead): bead is Epic {
  return bead.issue_type === 'epic';
}

/**
 * Reusable Kanban column component with header, count badge, and scrollable bead list
 * Renders EpicCard for epics and BeadCard for standalone tasks
 */
export function KanbanColumn({
  status,
  title,
  beads,
  allBeads,
  selectedBeadId,
  ticketNumbers,
  branchStatuses = {},
  onSelectBead,
  onChildClick,
  onNavigateToDependency,
  projectPath,
}: KanbanColumnProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 rounded-lg",
        "bg-zinc-900/30 border border-zinc-800/50"
      )}
    >
      {/* Column Header - fixed height with colored accent border */}
      <div className={cn(
        "flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/50",
        getColumnAccentBorder(status)
      )}>
        <h2 className={cn("font-semibold text-sm", getHeaderTextColor(status))}>{title}</h2>
        <Badge
          variant="secondary"
          className={cn("text-xs px-2 py-0.5", getBadgeVariant(status))}
        >
          {beads.length}
        </Badge>
      </div>

      {/* Scrollable Bead List */}
      <ScrollArea className="flex-1 min-h-0 p-3">
        <div className="space-y-3">
          {beads.map((bead) => {
            // Render EpicCard for epics, BeadCard for standalone tasks
            if (isEpic(bead)) {
              return (
                <EpicCard
                  key={bead.id}
                  epic={bead}
                  allBeads={allBeads}
                  ticketNumber={ticketNumbers?.get(bead.id)}
                  isSelected={selectedBeadId === bead.id}
                  onSelect={onSelectBead}
                  onChildClick={onChildClick ?? onSelectBead}
                  onNavigateToDependency={onNavigateToDependency}
                  projectPath={projectPath}
                />
              );
            }

            return (
              <BeadCard
                key={bead.id}
                bead={bead}
                ticketNumber={ticketNumbers?.get(bead.id)}
                isSelected={selectedBeadId === bead.id}
                branchStatus={branchStatuses[bead.id]}
                onSelect={onSelectBead}
              />
            );
          })}
          {beads.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No beads
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
