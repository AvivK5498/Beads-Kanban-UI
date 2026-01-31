"use client";

import { useState, useEffect } from "react";

import Link from "next/link";

import { ColorPicker } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  usePRSettings,
  MIN_POLLING_INTERVAL,
  MAX_POLLING_INTERVAL,
} from "@/hooks/use-pr-settings";
import type { MergeMethod } from "@/lib/api";
import { getTags, createTag, deleteTag, type Tag } from "@/lib/db";

/** Merge method options for the radio group */
const MERGE_METHOD_OPTIONS: { value: MergeMethod; label: string }[] = [
  { value: "merge", label: "Merge commit" },
  { value: "squash", label: "Squash and merge" },
  { value: "rebase", label: "Rebase and merge" },
];

export default function SettingsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [isLoading, setIsLoading] = useState(true);

  // PR settings hook
  const { settings: prSettings, isLoaded: prSettingsLoaded, updateSetting } = usePRSettings();

  useEffect(() => {
    async function loadTags() {
      try {
        const loadedTags = await getTags();
        setTags(loadedTags);
      } catch (error) {
        console.error("Failed to load tags:", error);
      }
      setIsLoading(false);
    }
    loadTags();
  }, []);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const tag = await createTag({ name: newTagName.trim(), color: newTagColor });
      setTags((prev) => [...prev, tag]);
      setNewTagName("");
      setNewTagColor("#3b82f6");
      setIsAddingTag(false);
    } catch (error) {
      console.error("Failed to create tag:", error);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      await deleteTag(tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (error) {
      console.error("Failed to delete tag:", error);
    }
  };

  return (
    <div className="dark min-h-dvh bg-[#0a0a0a]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0a0a0a]/80 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            aria-label="Go back to home"
            className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-white">Settings</h1>
        </div>
      </header>

      {/* Settings Content */}
      <main className="mx-auto max-w-2xl p-6">
        {/* Tags Section */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium text-zinc-100">Tags</h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-sm text-zinc-400">
              Manage your project tags here. Tags help organize and categorize your projects.
            </p>

            {/* Tags List */}
            <div className="mt-4 space-y-2">
              {isLoading ? (
                <p className="text-sm text-zinc-400">Loading tags…</p>
              ) : tags.length === 0 && !isAddingTag ? (
                <p className="text-sm text-zinc-400">No tags yet. Create one to get started.</p>
              ) : (
                tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-800/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-4 rounded-full"
                        style={{ backgroundColor: tag.color }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-zinc-200">{tag.name}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteTag(tag.id)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
                      title="Delete tag"
                      aria-label={`Delete tag ${tag.name}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        <line x1="10" x2="10" y1="11" y2="17" />
                        <line x1="14" x2="14" y1="11" y2="17" />
                      </svg>
                    </button>
                  </div>
                ))
              )}

              {/* Add Tag Form */}
              {isAddingTag && (
                <div className="mt-3 space-y-3 rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
                  <div className="flex items-center gap-2">
                    <ColorPicker value={newTagColor} onChange={setNewTagColor} />
                    <Input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Tag name…"
                      aria-label="Tag name"
                      className="flex-1 border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleCreateTag();
                        } else if (e.key === "Escape") {
                          setIsAddingTag(false);
                          setNewTagName("");
                          setNewTagColor("#3b82f6");
                        }
                      }}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      onClick={() => {
                        setIsAddingTag(false);
                        setNewTagName("");
                        setNewTagColor("#3b82f6");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-zinc-100 text-zinc-900 hover:bg-white"
                      onClick={handleCreateTag}
                      disabled={!newTagName.trim()}
                    >
                      Create Tag
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Add Tag Button */}
            {!isAddingTag && (
              <div className="mt-4">
                <button
                  onClick={() => setIsAddingTag(true)}
                  className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm text-zinc-900 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
                >
                  Add Tag
                </button>
              </div>
            )}
          </div>
        </section>

        {/* PR Status Settings Section */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium text-zinc-100">PR Status Settings</h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            {!prSettingsLoaded ? (
              <p className="text-sm text-zinc-400">Loading settings...</p>
            ) : (
              <div className="space-y-6">
                {/* Polling Interval */}
                <div>
                  <label
                    htmlFor="polling-interval"
                    className="block text-sm font-medium text-zinc-200"
                  >
                    Polling interval
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      id="polling-interval"
                      type="number"
                      min={MIN_POLLING_INTERVAL}
                      max={MAX_POLLING_INTERVAL}
                      value={prSettings.pollingInterval}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!isNaN(value)) {
                          updateSetting("pollingInterval", value);
                        }
                      }}
                      className="w-20 border-zinc-700 bg-zinc-800 text-zinc-100 tabular-nums"
                      aria-describedby="polling-interval-hint"
                    />
                    <span className="text-sm text-zinc-400">seconds</span>
                  </div>
                  <p id="polling-interval-hint" className="mt-1 text-xs text-zinc-500">
                    ({MIN_POLLING_INTERVAL}-{MAX_POLLING_INTERVAL})
                  </p>
                </div>

                {/* Default Merge Method */}
                <fieldset>
                  <legend className="text-sm font-medium text-zinc-200">
                    Default merge method
                  </legend>
                  <div className="mt-2 space-y-2" role="radiogroup" aria-label="Default merge method">
                    {MERGE_METHOD_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <input
                          type="radio"
                          name="merge-method"
                          value={option.value}
                          checked={prSettings.mergeMethod === option.value}
                          onChange={() => updateSetting("mergeMethod", option.value)}
                          className="size-4 border-zinc-600 bg-zinc-800 text-zinc-100 focus:ring-zinc-400 focus:ring-offset-[#0a0a0a]"
                        />
                        <span className="text-sm text-zinc-300">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* Boolean Settings */}
                <div className="space-y-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prSettings.showRateLimitWarnings}
                      onChange={(e) =>
                        updateSetting("showRateLimitWarnings", e.target.checked)
                      }
                      className="size-4 rounded border-zinc-600 bg-zinc-800 text-zinc-100 focus:ring-zinc-400 focus:ring-offset-[#0a0a0a]"
                    />
                    <span className="text-sm text-zinc-300">Show rate limit warnings</span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prSettings.autoMerge}
                      onChange={(e) => updateSetting("autoMerge", e.target.checked)}
                      className="size-4 rounded border-zinc-600 bg-zinc-800 text-zinc-100 focus:ring-zinc-400 focus:ring-offset-[#0a0a0a]"
                    />
                    <span className="text-sm text-zinc-300">Auto-merge when checks pass</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Data Section */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium text-zinc-100">Data</h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-red-400">Clear Local Database</p>
                <p className="text-sm text-zinc-400">
                  Remove all projects and tags from local storage
                </p>
              </div>
              <button className="rounded-md border border-red-800/50 bg-red-900/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]">
                Clear Data
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
