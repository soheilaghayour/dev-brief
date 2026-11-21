import {
  A2uiServerMessageSchema,
  BriefingPlanSchema,
  type A2uiServerMessage,
  type BriefingPlan,
  type Radar,
} from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import { describe, expect, it } from 'vitest';
import { retrievedStory } from '../../../test/copilotFixtures.js';
import { computeTagVelocity } from '../../common/tag-velocity/tagVelocity.js';
import {
  compileSection,
  createSurfaceMessage,
  rootMessage,
  subtitleMessage,
  type CompileContext,
  type RadarLookup,
} from './compileBriefing.js';
import type { RetrievedStory } from './retrievedStory.js';

type Section = BriefingPlan['sections'][number];

const SURFACE_ID = 'briefing-cbriefq0ts001';
const NOW = new Date('2026-11-20T12:00:00Z');

const stories = Array.from({ length: 24 }, (_, index) => retrievedStory(index + 1));

const emptyRadar: RadarLookup = ({ window, metric, tags }) =>
  computeTagVelocity({ stats: [], window, metric, now: NOW, tags });

function contextOf(overrides: Partial<CompileContext> = {}): CompileContext {
  return { surfaceId: SURFACE_ID, title: 'A briefing', stories, radar: emptyRadar, ...overrides };
}

const picks = (...ids: string[]): Section => ({
  kind: 'stories',
  picks: ids.map((storyId) => ({ storyId, note: `Note on ${storyId}` })),
});

/** Compiles the sections in order the way the pipeline does, returning each message. */
function compileAll(sections: Section[], context = contextOf()) {
  const messages: A2uiServerMessage[] = [];
  let childIds: string[] = [];
  sections.forEach((section, index) => {
    const compiled = compileSection(section, index, childIds, context);
    if (compiled.kind !== 'compiled') return;
    messages.push(compiled.message);
    childIds = compiled.childIds;
  });
  return { messages, childIds };
}

function componentsOf(message: A2uiServerMessage | undefined) {
  if (!message || !('updateComponents' in message)) throw new Error('Not an updateComponents');
  return message.updateComponents.components;
}

describe('compileSection', () => {
  it('AC-3.1.6 drops a pick that cites an unretrieved id and keeps the retrieved ones', () => {
    const compiled = compileSection(
      picks('cstory00000001', 'challucinated0', 'cstory00000002'),
      0,
      [],
      contextOf(),
    );

    expect(compiled.kind).toBe('compiled');
    if (compiled.kind !== 'compiled') return;
    expect(componentsOf(compiled.message).map(({ id }) => id)).toEqual([
      's0_story_0',
      's0_story_1',
      'root',
    ]);
    expect(compiled.storyIds).toEqual(['cstory00000001', 'cstory00000002']);
  });

  it('AC-3.1.6 drops a takeaway that cites only unretrieved ids, and keeps the valid ids of another', () => {
    const compiled = compileSection(
      {
        kind: 'takeaways',
        items: [
          { text: 'Invented claim.', storyIds: ['challucinated0'] },
          { text: 'Mixed claim.', storyIds: ['challucinated0', 'cstory00000003'] },
          { text: 'Uncited claim.', storyIds: [] },
        ],
      },
      0,
      [],
      contextOf(),
    );

    expect(compiled.kind).toBe('compiled');
    if (compiled.kind !== 'compiled') return;
    expect(componentsOf(compiled.message)[0]).toMatchObject({
      items: [
        { text: 'Mixed claim.', storyIds: ['cstory00000003'] },
        { text: 'Uncited claim.', storyIds: [] },
      ],
    });
  });

  it('AC-3.1.6 drops a consensus whose every point cites only unretrieved ids', () => {
    const compiled = compileSection(
      {
        kind: 'consensus',
        topic: 'Topic',
        verdict: 'mixed',
        pros: [{ point: 'Pro', storyIds: ['challucinated0'] }],
        cons: [{ point: 'Con', storyIds: ['challucinated1'] }],
      },
      0,
      [],
      contextOf(),
    );

    expect(compiled).toEqual({ kind: 'dropped' });
  });

  it('AC-3.1.6 drops a section left empty, and numbers the next one by its plan index', () => {
    const { messages, childIds } = compileAll([picks('challucinated0'), picks('cstory00000001')]);

    expect(messages).toHaveLength(1);
    expect(childIds).toEqual(['s1_story_0']);
  });

  it('AC-3.1.6 skips a section whose compiled entry fails the catalog schema, without throwing', () => {
    const broken = retrievedStory(30, { sources: [] });
    const compiled = compileSection(picks(broken.id), 0, [], contextOf({ stories: [broken] }));

    expect(compiled.kind).toBe('invalid');
    if (compiled.kind === 'invalid') expect(compiled.issues).toContain('sources');
  });

  it('AC-3.1.6 rejects a plan tag outside the taxonomy before it reaches the compiler', () => {
    const plan = {
      title: 'Plan',
      sections: [
        { kind: 'tags', tags: ['cobol'] },
        { kind: 'tags', tags: ['rust'] },
      ],
    };

    expect(BriefingPlanSchema.safeParse(plan).success).toBe(false);
  });

  it('AC-3.1.6 emits only messages that parse with the A2UI envelope schema, for every section kind', () => {
    const sections: Section[] = [
      { kind: 'takeaways', items: [{ text: 'Claim.', storyIds: ['cstory00000001'] }] },
      picks('cstory00000001', 'cstory00000002'),
      {
        kind: 'consensus',
        topic: 'Topic',
        verdict: 'mostly_positive',
        pros: [{ point: 'Pro', storyIds: ['cstory00000001'] }],
        cons: [],
      },
      { kind: 'velocity', tags: ['typescript', 'rust'], window: '30d', metric: 'engagement' },
      { kind: 'tags', tags: ['typescript', 'rust'] },
    ];

    const { messages } = compileAll(sections);

    expect(messages).toHaveLength(5);
    for (const message of messages) {
      expect(A2uiServerMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it('AC-3.1.6 compiles the largest legal plan, 6 stories sections of 4 picks, to a root of 24 children that parses', () => {
    const sections: Section[] = Array.from({ length: 6 }, (_, section) =>
      picks(...stories.slice(section * 4, section * 4 + 4).map(({ id }) => id)),
    );
    expect(BriefingPlanSchema.safeParse({ title: 'Max', sections }).success).toBe(true);

    const { messages, childIds } = compileAll(sections);

    expect(messages).toHaveLength(6);
    expect(childIds).toHaveLength(24);
    const root = componentsOf(messages.at(-1)).at(-1);
    expect(root).toMatchObject({ id: 'root', component: 'Briefing' });
    expect(root && 'children' in root ? root.children : []).toHaveLength(24);
    expect(A2uiServerMessageSchema.safeParse(messages.at(-1)).success).toBe(true);
  });

  it('gives deterministic UAX #31 ids, and re-sends root with the extended children after each section', () => {
    const { messages } = compileAll([
      { kind: 'takeaways', items: [{ text: 'Claim.', storyIds: ['cstory00000001'] }] },
      picks('cstory00000001', 'cstory00000002'),
      { kind: 'tags', tags: ['rust'] },
    ]);

    const rootsChildren = messages.map((message) => {
      const root = componentsOf(message).at(-1);
      return root && 'children' in root ? root.children : null;
    });
    expect(rootsChildren).toEqual([
      ['s0_takeaways'],
      ['s0_takeaways', 's1_story_0', 's1_story_1'],
      ['s0_takeaways', 's1_story_0', 's1_story_1', 's2_tags'],
    ]);
    for (const id of rootsChildren.flat()) expect(id).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
  });

  it('takes a card title, URL, sources and tags from the database, never from the plan', () => {
    const story = retrievedStory(1, {
      clusterId: 'ccluster00001',
      tldr: ['First.', 'Second.'],
      tags: ['rust', 'retired-slug'],
    });
    // The schema strips unknown keys; the compiler must not read any of them either way.
    const pick = {
      storyId: story.id,
      note: 'Why it matters',
      title: 'Fake',
      url: 'https://evil.example',
    };
    const section = BriefingPlanSchema.shape.sections.element.parse({
      kind: 'stories',
      picks: [pick],
    });

    const compiled = compileSection(section, 1, [], contextOf({ stories: [story] }));

    expect(compiled.kind).toBe('compiled');
    if (compiled.kind !== 'compiled') return;
    expect(componentsOf(compiled.message)[0]).toEqual({
      id: 's1_story_0',
      component: 'StoryClusterCard',
      storyId: story.id,
      clusterId: 'ccluster00001',
      title: story.title,
      url: story.url,
      domain: story.domain,
      publishedAt: story.publishedAt,
      sources: story.sources.map((source) => ({
        kind: source.kind,
        label: source.name,
        url: source.itemUrl,
        points: source.points,
        comments: source.comments,
        reactions: source.reactions,
        stars: source.stars,
      })),
      tags: ['rust'],
      tldr: ['First.', 'Second.'],
      note: 'Why it matters',
    });
  });

  it('cuts an over-long title, source label, source list and tag list to the catalog limits instead of dropping the card', () => {
    const [source] = retrievedStory(1).sources;
    if (!source) throw new Error('fixture has a source');
    const story = retrievedStory(1, {
      title: 'T'.repeat(300),
      tags: ['react', 'vue', 'typescript', 'javascript', 'rust', 'go', 'python'],
      tldr: ['x'.repeat(400)],
      sources: Array.from({ length: 8 }, () => ({ ...source, name: 'N'.repeat(60) })),
    });

    const compiled = compileSection(picks(story.id), 0, [], contextOf({ stories: [story] }));

    expect(compiled.kind).toBe('compiled');
    if (compiled.kind !== 'compiled') return;
    const card = componentsOf(compiled.message)[0];
    if (!card || card.component !== 'StoryClusterCard') throw new Error('expected a card');
    expect(card.title).toHaveLength(200);
    expect(card.title.endsWith('…')).toBe(true);
    expect(card.sources).toHaveLength(6);
    expect(card.sources[0]?.label).toHaveLength(40);
    expect(card.tags).toHaveLength(5);
    expect(card.tldr?.[0]).toHaveLength(220);
  });

  it('shows the same story once per stories section', () => {
    const { childIds } = compileAll([picks('cstory00000001', 'cstory00000001', 'cstory00000002')]);

    expect(childIds).toEqual(['s0_story_0', 's0_story_1']);
  });

  it('builds a velocity chart and tag counts from the tag stats it is given', () => {
    const stats = [
      { day: new Date('2026-11-19T00:00:00Z'), tag: 'rust', storyCount: 6, engagementSum: 90 },
      { day: new Date('2026-11-12T00:00:00Z'), tag: 'rust', storyCount: 3, engagementSum: 10 },
    ];
    const radar: RadarLookup = (query) => computeTagVelocity({ stats, now: NOW, ...query });

    const { messages } = compileAll(
      [
        { kind: 'velocity', tags: ['rust'], window: '7d', metric: 'stories' },
        { kind: 'tags', tags: ['rust', 'go'] },
      ],
      contextOf({ radar }),
    );

    const chart = componentsOf(messages[0])[0];
    if (!chart || chart.component !== 'TechVelocityChart') throw new Error('expected a chart');
    expect(chart.title).toBe('Story volume, last 7 days');
    expect(chart.series[0]?.points).toHaveLength(7);
    expect(chart.series[0]?.points.at(-1)).toEqual({ date: '2026-11-19', value: 6 });
    expect(componentsOf(messages[1])[0]).toMatchObject({
      tags: [
        { slug: 'rust', label: 'Rust', count: 6, deltaPct: 100 },
        { slug: 'go', label: 'Go' },
      ],
    });
  });
});

describe('opening messages', () => {
  it('AC-3.1.6 match the createSurface, root and subtitle messages of the PRD example sequence', () => {
    expect(createSurfaceMessage(SURFACE_ID)).toEqual(tsToolingBriefing[0]);
    expect(rootMessage(SURFACE_ID, "TypeScript tooling: this week's debates")).toEqual(
      tsToolingBriefing[1],
    );
    for (const message of [createSurfaceMessage(SURFACE_ID), rootMessage(SURFACE_ID, 'T')]) {
      expect(A2uiServerMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it('describes the retrieved set in the subtitle: count, date range and sources', () => {
    const at = (day: number, kind: 'hn' | 'devto' | 'rss', slug: string) =>
      retrievedStory(day, {
        publishedAt: `2026-11-${day}T08:00:00.000Z`,
        sources: [{ ...retrievedStory(1).sources[0]!, kind, slug }],
      });
    const set = [
      at(12, 'hn', 'hn'),
      at(15, 'devto', 'devto'),
      at(19, 'rss', 'blog-a'),
      at(18, 'rss', 'blog-b'),
      at(17, 'rss', 'blog-a'),
    ];

    expect(subtitleMessage(SURFACE_ID, set)).toEqual({
      version: '1.0',
      updateDataModel: {
        surfaceId: SURFACE_ID,
        path: '/meta/subtitle',
        value: 'Based on 5 stories · Nov 12–19 · HN, Dev.to, 2 blogs',
      },
    });
  });

  it('names both months when the date range crosses one, and one day when all share it', () => {
    const on = (publishedAt: string): RetrievedStory => retrievedStory(1, { publishedAt });

    expect(
      subtitleMessage(SURFACE_ID, [on('2026-10-30T10:00:00Z'), on('2026-11-02T10:00:00Z')]),
    ).toMatchObject({ updateDataModel: { value: expect.stringContaining('Oct 30–Nov 2') } });
    expect(subtitleMessage(SURFACE_ID, [on('2026-11-02T10:00:00Z')])).toMatchObject({
      updateDataModel: { value: expect.stringContaining('Based on 1 story · Nov 2 · ') },
    });
  });
});

describe('the PRD example sequence', () => {
  type FixtureCard = Extract<
    ReturnType<typeof componentsOf>[number],
    { component: 'StoryClusterCard' }
  >;
  const fixtureCard = componentsOf(tsToolingBriefing[4] as A2uiServerMessage)[0] as FixtureCard;
  const fixtureStory = retrievedStory(1, {
    id: fixtureCard.storyId,
    clusterId: fixtureCard.clusterId,
    title: fixtureCard.title,
    url: fixtureCard.url,
    domain: fixtureCard.domain,
    publishedAt: fixtureCard.publishedAt,
    tags: fixtureCard.tags,
    tldr: fixtureCard.tldr ?? null,
    sources: fixtureCard.sources.map((source) => ({
      kind: source.kind,
      slug: source.kind,
      name: source.label,
      itemUrl: source.url,
      points: source.points,
      comments: source.comments,
      reactions: source.reactions,
      stars: source.stars,
    })),
  });
  const others = ['cbriefts0002', 'cbriefts0003', 'cbriefts0004', 'cbriefts0005'].map((id, index) =>
    retrievedStory(index + 2, { id }),
  );
  const fixtureRadar = (messageIndex: number) =>
    componentsOf(tsToolingBriefing[messageIndex] as A2uiServerMessage);

  it('compiles the fixture plan to the fixture messages', () => {
    const fixtureTakeaways = fixtureRadar(3)[0];
    if (fixtureTakeaways?.component !== 'KeyTakeaways') throw new Error('fixture shape changed');
    const chart = fixtureRadar(6)[0];
    const badges = fixtureRadar(6)[1];
    if (chart?.component !== 'TechVelocityChart' || badges?.component !== 'TagBadgeList') {
      throw new Error('fixture shape changed');
    }
    const radar: RadarLookup = ({ window, metric, tags }): Radar => ({
      window,
      metric,
      series: tags.includes('typescript') && tags.length === 1 ? chart.series : [],
      movers: badges.tags.map(({ slug, label, count, deltaPct }) => ({
        tag: slug,
        label,
        current: count ?? 0,
        previous: 0,
        deltaPct: deltaPct ?? null,
      })),
    });
    const plan: BriefingPlan = {
      title: "TypeScript tooling: this week's debates",
      sections: [
        {
          kind: 'takeaways',
          items: fixtureTakeaways.items,
        },
        {
          kind: 'stories',
          picks: [{ storyId: fixtureStory.id, note: fixtureCard.note ?? '' }],
        },
        {
          kind: 'consensus',
          topic: 'Adopting the native compiler now',
          verdict: 'mixed',
          pros: [
            {
              point: 'Dramatic speedups in CI and editor responsiveness',
              storyIds: ['cbriefts0001'],
            },
          ],
          cons: [
            {
              point: 'Plugin/transformer APIs not yet at parity',
              storyIds: ['cbriefts0001', 'cbriefts0005'],
            },
          ],
        },
        { kind: 'velocity', tags: ['typescript'], window: '7d', metric: 'stories' },
        { kind: 'tags', tags: ['javascript', 'performance', 'testing'] },
      ],
    };
    const context = contextOf({
      title: plan.title,
      stories: [fixtureStory, ...others],
      radar,
    });

    const { messages } = compileAll(plan.sections, context);

    // The fixture's velocity and tags components share one message; the pipeline sends one per section.
    expect(messages.slice(0, 3)).toEqual(tsToolingBriefing.slice(3, 6));
    expect(componentsOf(messages[3])[0]).toEqual(
      componentsOf(tsToolingBriefing[6] as A2uiServerMessage)[0],
    );
    expect(componentsOf(messages[4])[0]).toEqual(
      componentsOf(tsToolingBriefing[6] as A2uiServerMessage)[1],
    );
    const lastRoot = componentsOf(messages[4]).at(-1);
    expect(lastRoot).toEqual(componentsOf(tsToolingBriefing[6] as A2uiServerMessage).at(-1));
  });
});
