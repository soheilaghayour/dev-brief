import { z } from 'zod';
import { toPlainText } from '../../common/text/plainText.js';
import type { CommentNode } from './flattenComments.js';

type AlgoliaComment = { text?: string | null; children: AlgoliaComment[] };
type DevtoComment = { body_html: string; children: DevtoComment[] };

// A deleted HN comment keeps its place in the tree with a null text.
const AlgoliaCommentSchema: z.ZodType<AlgoliaComment> = z.lazy(() =>
  z.object({ text: z.string().nullish(), children: z.array(AlgoliaCommentSchema) }),
);
const AlgoliaItemSchema = z.object({ children: z.array(AlgoliaCommentSchema) });

const DevtoCommentSchema: z.ZodType<DevtoComment> = z.lazy(() =>
  z.object({ body_html: z.string(), children: z.array(DevtoCommentSchema) }),
);
const DevtoCommentsSchema = z.array(DevtoCommentSchema);

const DevtoArticleSchema = z.object({ body_markdown: z.string() });

function fromAlgolia(comment: AlgoliaComment): CommentNode {
  return {
    text: comment.text ? toPlainText(comment.text) : null,
    children: comment.children.map(fromAlgolia),
  };
}

function fromDevto(comment: DevtoComment): CommentNode {
  return { text: toPlainText(comment.body_html), children: comment.children.map(fromDevto) };
}

/** The comment tree of an HN Algolia `items/{id}` payload, as plain text; throws on a payload of another shape. */
export function parseAlgoliaThread(payload: unknown) {
  return AlgoliaItemSchema.parse(payload).children.map(fromAlgolia);
}

/** The comment tree of a Dev.to `comments?a_id=` payload, as plain text; throws on a payload of another shape. */
export function parseDevtoThread(payload: unknown) {
  return DevtoCommentsSchema.parse(payload).map(fromDevto);
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
