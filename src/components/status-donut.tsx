"use client";

import { useMemo, useState } from "react";

interface BeadCounts {
  open: number;
  in_progress: number;
  inreview: number;
  closed: number;
}

interface StatusDonutProps {
  beadCounts: BeadCounts;
  size?: number;
  className?: string;
}

// Status colors matching the kanban board
const STATUS_COLORS = {
  open: "#3b82f6",        // blue-500
  in_progress: "#f59e0b", // amber-500
  inreview: "#06b6d4",    // cyan-500
  closed: "#22c55e",      // green-500
};

// Custom tooltip showing all statuses
function StatusTooltip({ beadCounts, total }: { beadCounts: BeadCounts; total: number }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-lg">
      <div className="mb-1.5 text-xs font-medium text-zinc-300">
        {total} task{total !== 1 ? "s" : ""}
      </div>
      <div className="space-y-1">
        {beadCounts.open > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.open }} />
            <span className="text-zinc-400">Open</span>
            <span className="ml-auto font-mono text-zinc-100">{beadCounts.open}</span>
          </div>
        )}
        {beadCounts.in_progress > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.in_progress }} />
            <span className="text-zinc-400">In Progress</span>
            <span className="ml-auto font-mono text-zinc-100">{beadCounts.in_progress}</span>
          </div>
        )}
        {beadCounts.inreview > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.inreview }} />
            <span className="text-zinc-400">In Review</span>
            <span className="ml-auto font-mono text-zinc-100">{beadCounts.inreview}</span>
          </div>
        )}
        {beadCounts.closed > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS.closed }} />
            <span className="text-zinc-400">Closed</span>
            <span className="ml-auto font-mono text-zinc-100">{beadCounts.closed}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusDonut({ beadCounts, size = 40, className }: StatusDonutProps) {
  const [isHovered, setIsHovered] = useState(false);

  const chartData = useMemo(() => {
    return [
      { status: "open", count: beadCounts.open, fill: STATUS_COLORS.open },
      { status: "in_progress", count: beadCounts.in_progress, fill: STATUS_COLORS.in_progress },
      { status: "inreview", count: beadCounts.inreview, fill: STATUS_COLORS.inreview },
      { status: "closed", count: beadCounts.closed, fill: STATUS_COLORS.closed },
    ].filter((item) => item.count > 0);
  }, [beadCounts]);

  const total = useMemo(() => {
    return beadCounts.open + beadCounts.in_progress + beadCounts.inreview + beadCounts.closed;
  }, [beadCounts]);

  // If no tasks, show empty state
  if (total === 0) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        aria-label="No tasks"
      >
        <div
          className="rounded-full border-2 border-dashed border-zinc-700 w-full h-full"
          title="No tasks"
        />
      </div>
    );
  }

  const innerRadius = size * 0.32;
  const outerRadius = size * 0.48;
  // Only add padding when there are multiple segments
  const paddingAngle = chartData.length > 1 ? 3 : 0;

  return (
    <div
      className={`relative ${className || ""}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          {/* Render pie segments */}
          {chartData.map((entry, index) => {
            // Calculate angles for each segment
            const startAngle = chartData
              .slice(0, index)
              .reduce((acc, d) => acc + (d.count / total) * 360, 0);
            const segmentAngle = (entry.count / total) * 360;
            const endAngle = startAngle + segmentAngle;

            // Check if this is a full circle (single segment covering 100%)
            const isFullCircle = chartData.length === 1;

            if (isFullCircle) {
              // For full circle, use two semicircular arcs
              // This avoids the issue where start and end points are the same
              return (
                <g key={entry.status}>
                  {/* First semicircle (top half) */}
                  <path
                    d={`M 0 ${-outerRadius} A ${outerRadius} ${outerRadius} 0 0 1 0 ${outerRadius} L 0 ${innerRadius} A ${innerRadius} ${innerRadius} 0 0 0 0 ${-innerRadius} Z`}
                    fill={entry.fill}
                  />
                  {/* Second semicircle (bottom half) */}
                  <path
                    d={`M 0 ${outerRadius} A ${outerRadius} ${outerRadius} 0 0 1 0 ${-outerRadius} L 0 ${-innerRadius} A ${innerRadius} ${innerRadius} 0 0 0 0 ${innerRadius} Z`}
                    fill={entry.fill}
                  />
                </g>
              );
            }

            // Add small padding between segments (only if multiple segments)
            const adjustedStart = startAngle + paddingAngle / 2;
            const adjustedEnd = endAngle - paddingAngle / 2;

            // Convert to radians (SVG uses radians, start from top)
            const startRad = ((adjustedStart - 90) * Math.PI) / 180;
            const endRad = ((adjustedEnd - 90) * Math.PI) / 180;

            // Calculate arc path
            const x1 = Math.cos(startRad) * outerRadius;
            const y1 = Math.sin(startRad) * outerRadius;
            const x2 = Math.cos(endRad) * outerRadius;
            const y2 = Math.sin(endRad) * outerRadius;
            const x3 = Math.cos(endRad) * innerRadius;
            const y3 = Math.sin(endRad) * innerRadius;
            const x4 = Math.cos(startRad) * innerRadius;
            const y4 = Math.sin(startRad) * innerRadius;

            const largeArcFlag = adjustedEnd - adjustedStart > 180 ? 1 : 0;

            const d = [
              `M ${x1} ${y1}`,
              `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
              `L ${x3} ${y3}`,
              `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
              "Z",
            ].join(" ");

            return (
              <path
                key={entry.status}
                d={d}
                fill={entry.fill}
              />
            );
          })}
          {/* Invisible circle covering entire donut area for hover detection */}
          <circle
            r={outerRadius}
            fill="transparent"
            style={{ cursor: "default" }}
          />
        </g>
      </svg>

      {/* Tooltip - shown on hover anywhere in the donut area */}
      {isHovered && (
        <div className="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap">
          <StatusTooltip beadCounts={beadCounts} total={total} />
        </div>
      )}
    </div>
  );
}
