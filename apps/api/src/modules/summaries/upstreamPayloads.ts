import { z } from 'zod';
import { toPlainText } from '../../common/text/plainText.js';
import type { CommentNode } from './flattenComments.js';

type ParsedComment = { text: string | null; children: unknown[] };

// A deleted HN comment keeps its place in the tree with a null text. Children are parsed node by node, so one malformed reply is dropped alone.
const AlgoliaCommentSchema = z
  .object({ text: z.string().nullish(), children: z.array(z.unknown()) })
  .transform(({ text, children }): ParsedComment => ({
    text: text ? toPlainText(text) : null,
    children,
  }));
const AlgoliaItemSchema = z.object({ children: z.array(z.unknown()) });

const DevtoCommentSchema = z
  .object({ body_html: z.string(), children: z.array(z.unknown()) })
  .transform(({ body_html, children }): ParsedComment => ({
    text: toPlainText(body_html),
    children,
  }));
const DevtoCommentsSchema = z.array(z.unknown());

const DevtoArticleSchema = z.object({ body_markdown: z.string() });

/** A thread's comment trees as plain text, and how many malformed comments were dropped with their replies. */
export type ParsedThread = { comments: CommentNode[]; dropped: number };

function parseCommentTrees(
  nodes: readonly unknown[],
  schema: z.ZodType<ParsedComment, z.ZodTypeDef, unknown>,
): ParsedThread {
  let dropped = 0;
  const parseLevel = (level: readonly unknown[]): CommentNode[] =>
    level.flatMap((node) => {
      const parsed = schema.safeParse(node);
      if (!parsed.success) {
        dropped += 1;
        return [];
      }
      return [{ text: parsed.data.text, children: parseLevel(parsed.data.children) }];
    });
  const comments = parseLevel(nodes);
  return { comments, dropped };
}

/** The comment tree of an HN Algolia `items/{id}` payload; throws when the payload as a whole has another shape. */
export function parseAlgoliaThread(payload: unknown) {
  return parseCommentTrees(AlgoliaItemSchema.parse(payload).children, AlgoliaCommentSchema);
}

/** The comment tree of a Dev.to `comments?a_id=` payload; throws when the payload as a whole has another shape. */
export function parseDevtoThread(payload: unknown) {
  return parseCommentTrees(DevtoCommentsSchema.parse(payload), DevtoCommentSchema);
}

/** The plain text of a Dev.to `articles/{id}` payload's Markdown body; throws on a payload of another shape. */
export function parseDevtoArticleText(payload: unknown) {
  return markdownToPlainText(DevtoArticleSchema.parse(payload).body_markdown);
}

// Front matter, Liquid embeds, images and link targets carry no words to summarise, and URLs in the input invite URLs in the output.
function markdownToPlainText(markdown: string) {
  const prose = markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/\{%[\s\S]*?%\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  return toPlainText(prose);
}
