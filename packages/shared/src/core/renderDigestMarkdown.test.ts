import { describe, expect, it } from 'vitest';
import { renderDigestMarkdown, type DigestItem } from './renderDigestMarkdown.js';

function item(overrides: Partial<DigestItem> & { storyId: string }): DigestItem {
  return {
    title: 'A story',
    url: 'https://example.com/a',
    tags: [],
    savedAt: '2026-11-18T10:00:00.000Z',
    note: null,
    ...overrides,
  };
}

describe('renderDigestMarkdown', () => {
  it('AC-3.4.4 writes the heading, then a section per story with link, tags and note', () => {
    const markdown = renderDigestMarkdown({
      week: '2026-W47',
      items: [item({ storyId: 'a', tags: ['react', 'typescript'], note: 'Read **this** twice.' })],
    });
    expect(markdown).toBe(
      [
        '# DevBrief digest — 2026-W47',
        '',
        '## [A story](https://example.com/a)',
        '',
        'Tags: react, typescript',
        '',
        'Read **this** twice.',
        '',
      ].join('\n'),
    );
  });

  it('AC-3.4.4 leaves out the tags and note lines a story does not have', () => {
    const markdown = renderDigestMarkdown({ week: '2026-W47', items: [item({ storyId: 'a' })] });
    expect(markdown).toBe('# DevBrief digest — 2026-W47\n\n## [A story](https://example.com/a)\n');
  });

  it('AC-3.4.4 keeps only the stories saved in the week, Sunday 23:59 UTC in and Monday 00:00 UTC out', () => {
    const markdown = renderDigestMarkdown({
      week: '2026-W47',
      items: [
        item({ storyId: 'last-week', title: 'Before', savedAt: '2026-11-15T23:59:59.999Z' }),
        item({ storyId: 'first', title: 'First', savedAt: '2026-11-16T00:00:00.000Z' }),
        item({ storyId: 'last', title: 'Last', savedAt: '2026-11-22T23:59:59.999Z' }),
        item({ storyId: 'next-week', title: 'After', savedAt: '2026-11-23T00:00:00.000Z' }),
      ],
    });
    expect(markdown).toContain('[First]');
    expect(markdown).toContain('[Last]');
    expect(markdown).not.toContain('Before');
    expect(markdown).not.toContain('After');
  });

  it('AC-3.4.4 lists the oldest save first', () => {
    const markdown = renderDigestMarkdown({
      week: '2026-W47',
      items: [
        item({ storyId: 'b', title: 'Later', savedAt: '2026-11-20T10:00:00.000Z' }),
        item({ storyId: 'a', title: 'Earlier', savedAt: '2026-11-17T10:00:00.000Z' }),
      ],
    });
    expect(markdown.indexOf('Earlier')).toBeLessThan(markdown.indexOf('Later'));
  });

  it('AC-3.4.4 a week spanning two years takes the saves of both sides', () => {
    const markdown = renderDigestMarkdown({
      week: '2020-W53',
      items: [
        item({ storyId: 'a', title: 'Dec', savedAt: '2020-12-31T10:00:00.000Z' }),
        item({ storyId: 'b', title: 'Jan', savedAt: '2021-01-02T10:00:00.000Z' }),
        item({ storyId: 'c', title: 'Next', savedAt: '2021-01-04T00:00:00.000Z' }),
      ],
    });
    expect(markdown).toContain('[Dec]');
    expect(markdown).toContain('[Jan]');
    expect(markdown).not.toContain('Next');
  });

  it('AC-3.4.4 limits the digest to a collection and names it in the heading', () => {
    const markdown = renderDigestMarkdown({
      week: '2026-W47',
      collection: { name: 'Frontend', storyIds: ['a'] },
      items: [item({ storyId: 'a', title: 'In' }), item({ storyId: 'b', title: 'Out' })],
    });
    expect(markdown.split('\n')[0]).toBe('# DevBrief digest — 2026-W47 · Frontend');
    expect(markdown).toContain('[In]');
    expect(markdown).not.toContain('Out');
  });

  it('AC-3.4.4 escapes Markdown in titles, tags and the collection name, and in the link target', () => {
    const markdown = renderDigestMarkdown({
      week: '2026-W47',
      collection: { name: '*Bold*', storyIds: ['a'] },
      items: [
        item({
          storyId: 'a',
          title: 'Why [React] *wins*\nand_more',
          url: 'https://example.com/a_(b) c',
          tags: ['c#'],
        }),
      ],
    });
    expect(markdown).toContain('· \\*Bold\\*');
    expect(markdown).toContain(
      '## [Why \\[React\\] \\*wins\\* and\\_more](https://example.com/a_%28b%29%20c)',
    );
    expect(markdown).toContain('Tags: c\\#');
  });

  it('AC-3.4.4 says so when nothing was saved in the week', () => {
    expect(
      renderDigestMarkdown({
        week: '2026-W47',
        items: [item({ storyId: 'a', savedAt: '2026-11-01T10:00:00.000Z' })],
      }),
    ).toBe('# DevBrief digest — 2026-W47\n\nNo stories saved this week.\n');
  });
});
