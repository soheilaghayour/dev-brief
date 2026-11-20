import { describe, expect, it } from 'vitest';
import { readSummaryFixture } from '../../../test/summaryFixtures.js';
import type { CommentNode } from './flattenComments.js';
import { parseAlgoliaThread, parseDevtoArticleText, parseDevtoThread } from './upstreamPayloads.js';

function countComments(nodes: readonly CommentNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countComments(node.children), 0);
}

describe('upstream comment payloads', () => {
  it('reads the recorded HN Algolia tree as plain text, nested replies included', () => {
    const { comments: thread, dropped } = parseAlgoliaThread(
      readSummaryFixture('hn-algolia', '50544168'),
    );

    expect(dropped).toBe(0);
    expect(thread).toHaveLength(12);
    expect(countComments(thread)).toBe(46);
    // The payload's HTML entities ("Amiga&#x27;s") are decoded.
    expect(thread[0]?.text).toMatch(/^I always thought Amiga's "tag list" concept/);
  });

  it('keeps a deleted HN comment as a null text so its replies stay in the tree', () => {
    const { comments } = parseAlgoliaThread({
      children: [{ text: null, children: [{ text: '<p>still here</p>', children: [] }] }],
    });

    expect(comments).toEqual([{ text: null, children: [{ text: 'still here', children: [] }] }]);
  });

  it('drops a malformed comment with its replies and counts it, keeping the rest of the thread', () => {
    const algolia = parseAlgoliaThread({
      children: [
        { text: 'kept', children: [{ text: 42, children: [] }] },
        { text: 'no children array' },
        { text: 'also kept', children: [] },
      ],
    });
    expect(algolia).toEqual({
      comments: [
        { text: 'kept', children: [] },
        { text: 'also kept', children: [] },
      ],
      dropped: 2,
    });

    const devto = parseDevtoThread([
      { body_html: '<p>kept</p>', children: [] },
      { body_html: null, children: [{ body_html: 'lost with its parent', children: [] }] },
    ]);
    expect(devto).toEqual({ comments: [{ text: 'kept', children: [] }], dropped: 1 });
  });

  it('reads the recorded Dev.to comments as plain text', () => {
    const { comments: thread } = parseDevtoThread(readSummaryFixture('devto-comments', '5071647'));

    expect(countComments(thread)).toBe(13);
    expect(thread[1]?.text).toBe("i didn't know it was opensource, nice 😃");
    expect(JSON.stringify(thread)).not.toMatch(/<[a-z/]/i);
  });

  it('turns a Dev.to Markdown body into prose without images, embeds or link targets', () => {
    const text = parseDevtoArticleText(readSummaryFixture('devto-articles', '5071647'));

    expect(text).toMatch(/^Hey everyone! 🎉 ____ I have some exciting news to share!/);
    expect(text).toContain('I created my **first GitHub Issue**');
    expect(text).not.toMatch(/https?:\/\/|\{%|!\[/);
    expect(
      parseDevtoArticleText({
        body_markdown: '---\ntitle: Hi\n---\nRead [the docs](https://example.com) <b>now</b>',
      }),
    ).toBe('Read the docs now');
  });

  it('throws on a payload of another shape', () => {
    expect(() => parseAlgoliaThread({ message: 'Not Found' })).toThrow();
    expect(() => parseDevtoThread({ error: 'not found', status: 404 })).toThrow();
    expect(() => parseDevtoArticleText({ id: 1 })).toThrow();
  });
});
