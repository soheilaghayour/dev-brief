import { estimateTokens } from '../llm/budget.js';

/** One comment of an upstream thread as plain text; `text` is null when the comment was deleted. */
export type CommentNode = { text: string | null; children: readonly CommentNode[] };

/** The tokens a comment costs at a position of the prompt. */
export type CommentTokens = (text: string, position: number) => number;

/** Comment texts breadth-first across all trees, without deleted or empty comments, trimmed to `maxTokens`. */
export function flattenComments(
  trees: readonly (readonly CommentNode[])[],
  { maxTokens, tokensOf = estimateTokens }: { maxTokens: number; tokensOf?: CommentTokens },
) {
  const kept: string[] = [];
  let usedTokens = 0;
  for (const node of breadthFirst(trees)) {
    const text = node.text?.trim();
    if (!text) continue;
    const tokens = tokensOf(text, kept.length);
    // A comment that doesn't fit is skipped, so one long comment can't crowd out the shorter ones after it.
    if (usedTokens + tokens > maxTokens) continue;
    kept.push(text);
    usedTokens += tokens;
  }
  return kept;
}

// Each depth alternates between the trees, so one long thread can't push every other source's comments out.
function breadthFirst(trees: readonly (readonly CommentNode[])[]) {
  const ordered: CommentNode[] = [];
  let levels = trees;
  while (levels.some((level) => level.length > 0)) {
    ordered.push(...interleave(levels));
    levels = levels.map((level) => level.flatMap((node) => node.children));
  }
  return ordered;
}

function interleave(levels: readonly (readonly CommentNode[])[]) {
  const longest = Math.max(...levels.map((level) => level.length));
  return Array.from({ length: longest }, (_, index) =>
    levels.flatMap((level) => level[index] ?? []),
  ).flat();
}
