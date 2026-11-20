import { z } from 'zod';
import { SourceKindSchema, TagSlugSchema } from '../contracts/story.js';

export const DEVBRIEF_CATALOG_ID = 'https://devbrief.dev/a2ui/catalogs/devbrief/v1.json';

/** A literal string or an A2UI v1.0 data binding; mirrors `CommonSchemas.DynamicString`. */
export const DynamicString = z.union([
  z.string(),
  z.object({ '@path': z.string().startsWith('/') }),
]);
/** Child component ids in their static form; mirrors `CommonSchemas.ChildList`. */
export const ChildIdList = z.array(z.string().min(1)).max(12);
const StoryId = z.string().min(1);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SourceStat = z.object({
  kind: SourceKindSchema,
  label: z.string().max(40),
  url: z.string().url(),
  points: z.number().int().nullable(),
  comments: z.number().int().nullable(),
  reactions: z.number().int().nullable(),
  stars: z.number().int().nullable(),
});

export const DevBriefComponents = {
  /** Root container of every briefing surface. Only valid as id "root". */
  Briefing: z.object({
    title: DynamicString,
    subtitle: DynamicString.optional(),
    children: ChildIdList,
  }),

  /** 1–5 numbered takeaways, each citing up to 3 stories (rendered as footnote chips). */
  KeyTakeaways: z.object({
    title: z.string().max(60).default('Key takeaways'),
    items: z
      .array(z.object({ text: z.string().max(200), storyIds: z.array(StoryId).max(3) }))
      .min(1)
      .max(5),
  }),

  /** A story (or cluster) with cross-source stats and optional TL;DR. Data injected from DB. */
  StoryClusterCard: z.object({
    storyId: StoryId,
    clusterId: z.string().nullable(),
    title: z.string().max(200),
    url: z.string().url(),
    domain: z.string(),
    publishedAt: z.string().datetime(),
    sources: z.array(SourceStat).min(1).max(6),
    tags: z.array(TagSlugSchema).max(5),
    tldr: z.array(z.string().max(220)).max(3).optional(),
    note: z.string().max(160).optional(),
  }),

  /** Community consensus on a topic, with pros/cons each citing stories. */
  ConsensusCallout: z.object({
    topic: z.string().max(80),
    verdict: z.enum(['mostly_positive', 'mixed', 'mostly_negative']),
    pros: z
      .array(z.object({ point: z.string().max(180), storyIds: z.array(StoryId).max(3) }))
      .max(4),
    cons: z
      .array(z.object({ point: z.string().max(180), storyIds: z.array(StoryId).max(3) }))
      .max(4),
    openQuestions: z.array(z.string().max(160)).max(3).optional(),
  }),

  /** Daily tag velocity line chart. Series injected from TagDailyStat. */
  TechVelocityChart: z.object({
    title: z.string().max(60),
    window: z.enum(['7d', '30d']),
    metric: z.enum(['stories', 'engagement']),
    series: z
      .array(
        z.object({
          tag: TagSlugSchema,
          label: z.string(),
          points: z.array(z.object({ date: IsoDate, value: z.number().nonnegative() })).max(31),
        }),
      )
      .min(1)
      .max(5),
  }),

  /** Related tags with optional velocity deltas; each links to /feed?tags=<slug>. */
  TagBadgeList: z.object({
    title: z.string().max(60).optional(),
    tags: z
      .array(
        z.object({
          slug: TagSlugSchema,
          label: z.string(),
          count: z.number().int().optional(),
          deltaPct: z.number().optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
} as const;

export type DevBriefComponentName = keyof typeof DevBriefComponents;

// A2UI v1.0 ids follow UAX #31 (no hyphens), and "root" is reserved for the Briefing.
const ComponentId = z
  .string()
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'A component id is a UAX #31 identifier')
  .regex(/^(?!root$)/, 'Only the Briefing may have the id "root"');
const C = DevBriefComponents;

/** A component entry in `updateComponents`: `{ id, component, ...props }`. */
export const A2uiComponentEntrySchema = z.discriminatedUnion('component', [
  C.Briefing.extend({ id: z.literal('root'), component: z.literal('Briefing') }),
  C.KeyTakeaways.extend({ id: ComponentId, component: z.literal('KeyTakeaways') }),
  C.StoryClusterCard.extend({ id: ComponentId, component: z.literal('StoryClusterCard') }),
  C.ConsensusCallout.extend({ id: ComponentId, component: z.literal('ConsensusCallout') }),
  C.TechVelocityChart.extend({ id: ComponentId, component: z.literal('TechVelocityChart') }),
  C.TagBadgeList.extend({ id: ComponentId, component: z.literal('TagBadgeList') }),
]);
export type A2uiComponentEntry = z.infer<typeof A2uiComponentEntrySchema>;

/** One A2UI v1.0 server → client envelope. */
export const A2uiServerMessageSchema = z.union([
  z.object({
    version: z.literal('1.0'),
    createSurface: z.object({
      surfaceId: z.string(),
      catalogId: z.string().url(),
      components: z.array(A2uiComponentEntrySchema).optional(),
      dataModel: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    version: z.literal('1.0'),
    updateComponents: z.object({
      surfaceId: z.string(),
      components: z.array(A2uiComponentEntrySchema).min(1),
    }),
  }),
  z.object({
    version: z.literal('1.0'),
    updateDataModel: z.object({
      surfaceId: z.string(),
      path: z.string().default('/'),
      value: z.unknown(),
    }),
  }),
  z.object({ version: z.literal('1.0'), deleteSurface: z.object({ surfaceId: z.string() }) }),
]);
export type A2uiServerMessage = z.infer<typeof A2uiServerMessageSchema>;
