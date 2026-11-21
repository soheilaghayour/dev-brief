import {
  A2uiServerMessageSchema,
  DEVBRIEF_CATALOG_ID,
  TAG_LABELS,
  type A2uiServerMessage,
  type TagSlug,
} from '@devbrief/shared';

/** Fewer retrieved stories than this and the copilot answers without a model call (PRD AC-3.1.7). */
export const MIN_COVERAGE_STORIES = 3;

const MAX_SUGGESTED_TAGS = 5;

/** The question's own tags first, then the most-covered tags of the last 7 days, without repeats, at most 5. */
export function suggestedTags(questionTags: readonly TagSlug[], popularTags: readonly TagSlug[]) {
  return [...new Set([...questionTags, ...popularTags])].slice(0, MAX_SUGGESTED_TAGS);
}

/** The fixed "Not enough coverage" briefing: a root with a badge list of tags to try, no model involved. */
export function noCoverageBriefing({
  question,
  suggestedTags: tags,
  surfaceId,
}: {
  question: string;
  suggestedTags: readonly TagSlug[];
  surfaceId: string;
}): A2uiServerMessage[] {
  const badgeList = tags.length
    ? [
        {
          id: 's0_tags',
          component: 'TagBadgeList',
          title: 'Try these topics',
          tags: tags.map((slug) => ({ slug, label: TAG_LABELS[slug] })),
        },
      ]
    : [];
  return [
    {
      version: '1.0',
      createSurface: { surfaceId, catalogId: DEVBRIEF_CATALOG_ID },
    },
    {
      version: '1.0',
      updateComponents: {
        surfaceId,
        components: [
          ...badgeList,
          {
            id: 'root',
            component: 'Briefing',
            title: 'Not enough coverage',
            subtitle: `Fewer than ${MIN_COVERAGE_STORIES} stories from the last 7 days match “${question}”.`,
            children: badgeList.map((component) => component.id),
          },
        ],
      },
    },
  ].map((message) => A2uiServerMessageSchema.parse(message));
}
