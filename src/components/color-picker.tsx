"use client";

import * as React from "react";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
  "#78716c", // stone
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const [customColor, setCustomColor] = React.useState(value);
  const [isOpen, setIsOpen] = React.useState(false);

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setCustomColor(newColor);
    // Only update if it's a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(newColor)) {
      onChange(newColor);
    }
  };

  const handlePresetClick = (color: string) => {
    onChange(color);
    setCustomColor(color);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 w-8 p-0 border-2", className)}
          style={{ backgroundColor: value }}
        >
          <span className="sr-only">Pick a color</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-3">
          {/* Preset colors */}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                className={cn(
                  "h-7 w-7 rounded-md border-2 transition-transform hover:scale-110",
                  value === color ? "border-zinc-900 ring-2 ring-zinc-900 ring-offset-1" : "border-transparent"
                )}
                style={{ backgroundColor: color }}
                onClick={() => handlePresetClick(color)}
                type="button"
              >
                {value === color && (
                  <Check className="h-4 w-4 mx-auto text-white drop-shadow-sm" />
                )}
                <span className="sr-only">{color}</span>
              </button>
            ))}
          </div>

          {/* Custom hex input */}
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-md border"
              style={{ backgroundColor: customColor }}
            />
            <Input
              value={customColor}
              onChange={handleCustomColorChange}
              placeholder="#000000"
              className="h-8 font-mono text-sm"
              maxLength={7}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
