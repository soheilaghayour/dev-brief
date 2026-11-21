import {
  A2uiComponentEntrySchema,
  A2uiServerMessageSchema,
  type A2uiComponentEntry,
  type A2uiServerMessage,
  type BriefingPlan,
  DEVBRIEF_CATALOG_ID,
  isTagSlug,
  type Radar,
  type RadarMetric,
  type RadarWindow,
  TAG_LABELS,
  type TagSlug,
} from '@devbrief/shared';
import type { RetrievedStory } from './retrievedStory.js';

type PlanSection = BriefingPlan['sections'][number];

/** The tag series a `velocity` or `tags` section reads, computed from `TagDailyStat` by the caller. */
export type RadarLookup = (query: {
  window: RadarWindow;
  metric: RadarMetric;
  tags: TagSlug[];
}) => Radar;

export type CompileContext = {
  surfaceId: string;
  /** The plan's title. */
  title: string;
  /** Every story retrieved for the question: the allowlist of ids a section may cite. */
  stories: readonly RetrievedStory[];
  radar: RadarLookup;
};

/** What compiling one plan section gives: the message to send, or why nothing is sent. */
export type CompiledSection =
  | {
      kind: 'compiled';
      message: A2uiServerMessage;
      /** The ids of all the surface's `root` children after this section. */
      childIds: string[];
      /** The retrieved stories the section shows or cites. */
      storyIds: string[];
    }
  /** Every story the section cited is outside the retrieved set. */
  | { kind: 'dropped' }
  /** A compiled entry failed the catalog schema, so the section is skipped (PRD §6.4.4 rule 6). */
  | { kind: 'invalid'; issues: string };

type ComponentDraft = Record<string, unknown> & { id: string };

const SUBTITLE_PATH = '/meta/subtitle';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Cuts DB text to a catalog limit, with an ellipsis, so a long value never drops its card. */
function cut(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** The first message of a surface: its catalog and the subtitle the root binds to. */
export function createSurfaceMessage(surfaceId: string): A2uiServerMessage {
  return A2uiServerMessageSchema.parse({
    version: '1.0',
    createSurface: {
      surfaceId,
      catalogId: DEVBRIEF_CATALOG_ID,
      dataModel: { meta: { subtitle: 'Retrieving stories…' } },
    },
  });
}

function rootEntry(title: string, childIds: readonly string[]): ComponentDraft {
  return {
    id: 'root',
    component: 'Briefing',
    title,
    subtitle: { '@path': SUBTITLE_PATH },
    children: [...childIds],
  };
}

/** The `root` Briefing with no children yet; sent once the plan's title is complete. */
export function rootMessage(surfaceId: string, title: string): A2uiServerMessage {
  return A2uiServerMessageSchema.parse(updateComponents(surfaceId, [rootEntry(title, [])]));
}

function updateComponents(surfaceId: string, components: ComponentDraft[]) {
  return { version: '1.0', updateComponents: { surfaceId, components } };
}

function dateRange(stories: readonly RetrievedStory[]) {
  const days = stories.map((story) => new Date(story.publishedAt));
  const first = new Date(Math.min(...days.map((day) => day.getTime())));
  const last = new Date(Math.max(...days.map((day) => day.getTime())));
  const month = (day: Date) => MONTHS[day.getUTCMonth()];
  const start = `${month(first)} ${first.getUTCDate()}`;
  if (first.toISOString().slice(0, 10) === last.toISOString().slice(0, 10)) return start;
  const end =
    month(first) === month(last) ? `${last.getUTCDate()}` : `${month(last)} ${last.getUTCDate()}`;
  return `${start}–${end}`;
}

function sourceSummary(stories: readonly RetrievedStory[]) {
  const sources = stories.flatMap((story) => story.sources);
  const slugsOf = (kind: string) =>
    new Set(sources.filter((source) => source.kind === kind).map((source) => source.slug));
  return [
    slugsOf('hn').size > 0 && 'HN',
    slugsOf('devto').size > 0 && 'Dev.to',
    slugsOf('rss').size > 0 && plural(slugsOf('rss').size, 'blog'),
    slugsOf('github').size > 0 && 'GitHub',
  ]
    .filter(Boolean)
    .join(', ');
}

/** Replaces the "Retrieving stories…" subtitle with what the briefing is based on. */
export function subtitleMessage(
  surfaceId: string,
  stories: readonly RetrievedStory[],
): A2uiServerMessage {
  return A2uiServerMessageSchema.parse({
    version: '1.0',
    updateDataModel: {
      surfaceId,
      path: SUBTITLE_PATH,
      value: `Based on ${plural(stories.length, 'story', 'stories')} · ${dateRange(stories)} · ${sourceSummary(stories)}`,
    },
  });
}

/** Keeps the cited ids that were retrieved; a point that cited only unretrieved ids is dropped, one that cited none is kept. */
function citedPoints<POINT extends { storyIds: string[] }>(
  points: readonly POINT[],
  retrieved: ReadonlySet<string>,
) {
  return points.flatMap((point) => {
    const storyIds = point.storyIds.filter((id) => retrieved.has(id));
    return point.storyIds.length > 0 && storyIds.length === 0 ? [] : [{ ...point, storyIds }];
  });
}

function storyCard(story: RetrievedStory, id: string, note: string): ComponentDraft {
  const tldr = story.tldr?.slice(0, 3).map((line) => cut(line, 220));
  return {
    id,
    component: 'StoryClusterCard',
    storyId: story.id,
    clusterId: story.clusterId,
    title: cut(story.title, 200),
    url: story.url,
    domain: story.domain,
    publishedAt: story.publishedAt,
    sources: story.sources.slice(0, 6).map((source) => ({
      kind: source.kind,
      label: cut(source.name, 40),
      url: source.itemUrl,
      points: source.points,
      comments: source.comments,
      reactions: source.reactions,
      stars: source.stars,
    })),
    tags: story.tags.filter(isTagSlug).slice(0, 5),
    ...(tldr?.length && { tldr }),
    note,
  };
}

const WINDOW_DAYS = { '7d': 7, '30d': 30 } as const satisfies Record<RadarWindow, number>;
const METRIC_TITLES = {
  stories: 'Story volume',
  engagement: 'Engagement',
} as const satisfies Record<RadarMetric, string>;

/** The component entries of one section and the stories it uses; an empty list means the section is dropped. */
function sectionComponents(section: PlanSection, index: number, context: CompileContext) {
  const byId = new Map(context.stories.map((story) => [story.id, story]));
  const retrieved = new Set(byId.keys());
  const id = `s${index}_${section.kind}`;
  switch (section.kind) {
    case 'takeaways': {
      const items = citedPoints(section.items, retrieved);
      return {
        components: items.length
          ? [{ id, component: 'KeyTakeaways', title: 'Key takeaways', items }]
          : [],
        storyIds: items.flatMap((item) => item.storyIds),
      };
    }
    case 'stories': {
      const seen = new Set<string>();
      const picks = section.picks.flatMap((pick) => {
        const story = byId.get(pick.storyId);
        if (!story || seen.has(story.id)) return [];
        seen.add(story.id);
        return [{ story, note: pick.note }];
      });
      return {
        components: picks.map(({ story, note }, position) =>
          storyCard(story, `s${index}_story_${position}`, note),
        ),
        storyIds: picks.map(({ story }) => story.id),
      };
    }
    case 'consensus': {
      const pros = citedPoints(section.pros, retrieved);
      const cons = citedPoints(section.cons, retrieved);
      return {
        components:
          pros.length + cons.length
            ? [
                {
                  id,
                  component: 'ConsensusCallout',
                  topic: section.topic,
                  verdict: section.verdict,
                  pros,
                  cons,
                },
              ]
            : [],
        storyIds: [...pros, ...cons].flatMap((cited) => cited.storyIds),
      };
    }
    case 'velocity': {
      const { series } = context.radar({
        window: section.window,
        metric: section.metric,
        tags: section.tags,
      });
      return {
        components: [
          {
            id,
            component: 'TechVelocityChart',
            title: `${METRIC_TITLES[section.metric]}, last ${WINDOW_DAYS[section.window]} days`,
            window: section.window,
            metric: section.metric,
            series,
          },
        ],
        storyIds: [],
      };
    }
    case 'tags': {
      const { movers } = context.radar({ window: '7d', metric: 'stories', tags: section.tags });
      const tags = [...new Set(section.tags)].map((slug) => {
        const mover = movers.find((candidate) => candidate.tag === slug);
        return {
          slug,
          label: TAG_LABELS[slug],
          ...(mover && { count: mover.current }),
          ...(typeof mover?.deltaPct === 'number' && { deltaPct: mover.deltaPct }),
        };
      });
      return {
        components: [{ id, component: 'TagBadgeList', title: 'Explore related', tags }],
        storyIds: [],
      };
    }
  }
}

function issuesOf(error: { issues: readonly { path: (string | number)[]; message: string }[] }) {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

/**
 * Compiles one plan section to its `updateComponents` message, which also re-sends `root` with the
 * extended children. `childIds` are the root's children so far; the entry ids use the plan index, so a
 * skipped section leaves a gap in the numbering instead of renaming later components.
 */
export function compileSection(
  section: PlanSection,
  index: number,
  childIds: readonly string[],
  context: CompileContext,
): CompiledSection {
  const { components, storyIds } = sectionComponents(section, index, context);
  if (components.length === 0) return { kind: 'dropped' };

  const entries: A2uiComponentEntry[] = [];
  for (const component of components) {
    const entry = A2uiComponentEntrySchema.safeParse(component);
    if (!entry.success) return { kind: 'invalid', issues: issuesOf(entry.error) };
    entries.push(entry.data);
  }
  const allChildIds = [...childIds, ...entries.map((entry) => entry.id)];
  const root = A2uiComponentEntrySchema.safeParse(rootEntry(context.title, allChildIds));
  if (!root.success) return { kind: 'invalid', issues: issuesOf(root.error) };

  const message = A2uiServerMessageSchema.safeParse(
    updateComponents(context.surfaceId, [...entries, root.data]),
  );
  if (!message.success) return { kind: 'invalid', issues: issuesOf(message.error) };
  return { kind: 'compiled', message: message.data, childIds: allChildIds, storyIds };
}
