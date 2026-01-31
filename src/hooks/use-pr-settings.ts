/**
 * Hook for managing PR status settings stored in localStorage
 *
 * Provides read/write access to PR polling and merge settings
 * with automatic persistence to localStorage.
 */

import { useState, useEffect, useCallback } from "react";

import type { MergeMethod } from "@/lib/api";

/**
 * PR settings stored in localStorage
 */
export interface PRSettings {
  /** Polling interval in seconds (10-300) */
  pollingInterval: number;
  /** Default merge method for PRs */
  mergeMethod: MergeMethod;
  /** Whether to show rate limit warnings */
  showRateLimitWarnings: boolean;
  /** Whether to auto-merge when checks pass */
  autoMerge: boolean;
}

/**
 * Default PR settings values
 */
const DEFAULT_SETTINGS: PRSettings = {
  pollingInterval: 30,
  mergeMethod: "squash",
  showRateLimitWarnings: true,
  autoMerge: false,
};

/** localStorage key for PR settings */
const STORAGE_KEY = "beads-pr-settings";

/** Minimum polling interval in seconds */
export const MIN_POLLING_INTERVAL = 10;

/** Maximum polling interval in seconds */
export const MAX_POLLING_INTERVAL = 300;

/**
 * Result type for the usePRSettings hook
 */
export interface UsePRSettingsResult {
  /** Current settings */
  settings: PRSettings;
  /** Whether settings are loaded */
  isLoaded: boolean;
  /** Update a single setting */
  updateSetting: <K extends keyof PRSettings>(
    key: K,
    value: PRSettings[K]
  ) => void;
  /** Reset all settings to defaults */
  resetSettings: () => void;
}

/**
 * Validates and clamps polling interval to allowed range
 */
function clampPollingInterval(value: number): number {
  return Math.max(MIN_POLLING_INTERVAL, Math.min(MAX_POLLING_INTERVAL, value));
}

/**
 * Validates merge method
 */
function isValidMergeMethod(value: unknown): value is MergeMethod {
  return value === "merge" || value === "squash" || value === "rebase";
}

/**
 * Safely parse settings from localStorage
 */
function parseStoredSettings(stored: string | null): PRSettings {
  if (!stored) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(stored);

    return {
      pollingInterval:
        typeof parsed.pollingInterval === "number"
          ? clampPollingInterval(parsed.pollingInterval)
          : DEFAULT_SETTINGS.pollingInterval,
      mergeMethod: isValidMergeMethod(parsed.mergeMethod)
        ? parsed.mergeMethod
        : DEFAULT_SETTINGS.mergeMethod,
      showRateLimitWarnings:
        typeof parsed.showRateLimitWarnings === "boolean"
          ? parsed.showRateLimitWarnings
          : DEFAULT_SETTINGS.showRateLimitWarnings,
      autoMerge:
        typeof parsed.autoMerge === "boolean"
          ? parsed.autoMerge
          : DEFAULT_SETTINGS.autoMerge,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Hook to manage PR settings in localStorage
 *
 * @returns Object containing settings, loading state, and update functions
 *
 * @example
 * ```tsx
 * function PRSettingsForm() {
 *   const { settings, updateSetting, isLoaded } = usePRSettings();
 *
 *   if (!isLoaded) return <Skeleton />;
 *
 *   return (
 *     <input
 *       type="number"
 *       value={settings.pollingInterval}
 *       onChange={(e) => updateSetting('pollingInterval', Number(e.target.value))}
 *     />
 *   );
 * }
 * ```
 */
export function usePRSettings(): UsePRSettingsResult {
  const [settings, setSettings] = useState<PRSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount (lazy initialization pattern)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsedSettings = parseStoredSettings(stored);
    setSettings(parsedSettings);
    setIsLoaded(true);
  }, []);

  /**
   * Update a single setting and persist to localStorage
   */
  const updateSetting = useCallback(
    <K extends keyof PRSettings>(key: K, value: PRSettings[K]) => {
      setSettings((prev) => {
        // Apply validation for polling interval
        const validatedValue =
          key === "pollingInterval" && typeof value === "number"
            ? (clampPollingInterval(value) as PRSettings[K])
            : value;

        const updated = { ...prev, [key]: validatedValue };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  /**
   * Reset all settings to defaults
   */
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }, []);

  return {
    settings,
    isLoaded,
    updateSetting,
    resetSettings,
  };
}
