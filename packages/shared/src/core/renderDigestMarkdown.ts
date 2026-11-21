import { isoWeekOf } from './isoWeek.js';

export type DigestItem = {
  storyId: string;
  title: string;
  url: string;
  tags: readonly string[];
  /** When the story was saved; decides its week. */
  savedAt: string;
  note: string | null;
};

export type DigestInput = {
  /** An ISO week like `2026-W47`, in UTC. */
  week: string;
  /** Limits the digest to a collection's stories. */
  collection?: { name: string; storyIds: readonly string[] };
  items: readonly DigestItem[];
};

const MARKDOWN_SPECIALS = /[\\`*_{}[\]<>#|~]/g;

/** One line of plain text that can't open emphasis, a link, a tag or a heading. */
function escapeText(text: string) {
  return text.replace(/\s+/g, ' ').trim().replace(MARKDOWN_SPECIALS, '\\$&');
}

// Spaces, parentheses and angle brackets would end a link target early, and a backslash would escape its end.
function escapeUrl(url: string) {
  return url.replace(
    /[\s()<>\\]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

// Every line in a blockquote: an open code fence, list or heading in the note ends with it and can't swallow the entries after.
function quoteNote(note: string) {
  return note
    .split(/\r?\n/)
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

function renderItem(item: DigestItem) {
  const lines = [`## [${escapeText(item.title)}](${escapeUrl(item.url)})`];
  if (item.tags.length > 0) lines.push('', `Tags: ${item.tags.map(escapeText).join(', ')}`);
  if (item.note) lines.push('', quoteNote(item.note));
  return lines.join('\n');
}

/** A Markdown digest of the stories saved in one UTC ISO week, oldest save first; each note is the writer's own Markdown, quoted so it stays inside its entry. */
export function renderDigestMarkdown({ week, collection, items }: DigestInput) {
  const members = collection && new Set(collection.storyIds);
  const inDigest = items
    .filter((item) => isoWeekOf(new Date(item.savedAt)) === week)
    .filter((item) => !members || members.has(item.storyId))
    .sort((a, b) => (a.savedAt < b.savedAt ? -1 : a.savedAt > b.savedAt ? 1 : 0));
  const heading = `# DevBrief digest — ${week}${collection ? ` · ${escapeText(collection.name)}` : ''}`;
  if (inDigest.length === 0) return `${heading}\n\nNo stories saved this week.\n`;
  return `${heading}\n\n${inDigest.map(renderItem).join('\n\n')}\n`;
}
