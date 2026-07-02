/**
 * Design Doc Utilities
 * Shared functions for fetching and processing design documents
 */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || '';

/**
 * Fetch design doc content from the backend API
 */
export async function fetchDesignDoc(path: string, projectPath: string): Promise<string> {
  const encodedPath = encodeURIComponent(path);
  const encodedProjectPath = encodeURIComponent(projectPath);
  const response = await fetch(
    `${API_BASE}/api/fs/read?path=${encodedPath}&project_path=${encodedProjectPath}`
  );
  if (!response.ok) {
    throw new Error('Failed to fetch design doc: ' + response.statusText);
  }
  const data = await response.json();
  return data.content || '';
}

/**
 * Strip markdown syntax and convert to plain text preview
 * Removes headers, links, code blocks, bold, italic, etc.
 */
export function truncateMarkdownToPlainText(markdown: string, maxChars: number = 180): string {
  let text = markdown;

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');

  // Remove inline code
  text = text.replace(/`[^`]+`/g, '');

  // Remove headers (# ## ###)
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove links but keep text: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove bold/italic: **text** or *text* -> text
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');

  // Remove blockquotes
  text = text.replace(/^>\s+/gm, '');

  // Remove horizontal rules
  text = text.replace(/^-{3,}$/gm, '');

  // Remove list markers
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');
  text = text.replace(/^[\s]*\d+\.\s+/gm, '');

  // Collapse multiple newlines
  text = text.replace(/\n{2,}/g, ' ');

  // Trim and truncate
  text = text.trim();

  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(0, maxChars).trim() + '…';
}

/**
 * Shared prose classes for markdown rendering
 * Ensures consistent styling across preview and full view
 */
export const designDocProseClasses = "prose prose-sm dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-code:text-sm prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded";
