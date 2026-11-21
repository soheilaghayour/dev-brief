import { A2uiServerMessageSchema } from '@devbrief/shared';
import noCoverageFixture from '@devbrief/shared/a2ui/fixtures/noCoverageBriefing.json';
import { describe, expect, it } from 'vitest';
import { noCoverageBriefing, suggestedTags } from './noCoverageBriefing.js';

const input = {
  question: 'What happened with COBOL this week?',
  suggestedTags: ['rust', 'typescript', 'ai-llms'],
  surfaceId: 'briefing-cnocoverage01',
} as const;

describe('noCoverageBriefing', () => {
  it('AC-3.1.7 gives the same messages for the same input, and they all parse', () => {
    const first = noCoverageBriefing(input);

    expect(noCoverageBriefing(input)).toEqual(first);
    for (const message of first)
      expect(A2uiServerMessageSchema.safeParse(message).success).toBe(true);
  });

  it('AC-3.1.7 builds a "Not enough coverage" root over a badge list of the suggested tags', () => {
    const [createSurface, update] = noCoverageBriefing(input);

    expect(createSurface).toMatchObject({ createSurface: { surfaceId: input.surfaceId } });
    expect(update).toMatchObject({
      updateComponents: {
        surfaceId: input.surfaceId,
        components: [
          {
            id: 's0_tags',
            component: 'TagBadgeList',
            tags: [
              { slug: 'rust', label: 'Rust' },
              { slug: 'typescript', label: 'TypeScript' },
              { slug: 'ai-llms', label: 'AI/LLMs' },
            ],
          },
          {
            id: 'root',
            component: 'Briefing',
            title: 'Not enough coverage',
            children: ['s0_tags'],
          },
        ],
      },
    });
  });

  it('AC-3.1.7 leaves the badge list out when there is no tag to suggest, which the catalog would reject', () => {
    const [, update] = noCoverageBriefing({ ...input, suggestedTags: [] });

    expect(update).toMatchObject({
      updateComponents: { components: [{ id: 'root', children: [] }] },
    });
  });
});

describe('suggestedTags', () => {
  it('AC-3.1.7 puts the question own tags first, then the most-covered ones, without repeats, up to 5', () => {
    expect(
      suggestedTags(['rust', 'go'], ['go', 'typescript', 'python', 'devops', 'css', 'mobile']),
    ).toEqual(['rust', 'go', 'typescript', 'python', 'devops']);
  });

  it('gives only the popular tags when the question has none', () => {
    expect(suggestedTags([], ['go', 'rust'])).toEqual(['go', 'rust']);
  });

  it('AC-3.1.7 builds exactly the shared fixture the web renderer is tested with', () => {
    expect(
      noCoverageBriefing({
        question: 'COBOL on the blockchain',
        suggestedTags: ['rust', 'typescript'],
        surfaceId: 'briefing-cnocover0001',
      }),
    ).toEqual(noCoverageFixture);
  });
});
