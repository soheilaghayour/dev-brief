import { cache } from 'react';
import { notFound } from 'next/navigation';
import { StoryNote } from '@/components/notes/StoryNote';
import { ClusterMembers } from '@/components/story/ClusterMembers';
import { SourceItemList } from '@/components/story/SourceItemList';
import { StoryHeader } from '@/components/story/StoryHeader';
import { SummaryPanel } from '@/components/story/SummaryPanel';
import { isFeatureEnabled } from '@/config/features';
import { ApiError } from '@/lib/api/apiError';
import { getStory } from '@/lib/api/endpoints';

type StoryPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ summarize?: string }>;
};

const SUMMARY_SOURCE_KINDS = new Set<string>(['hn', 'devto']);

// Shared by the metadata and the page, so one request serves both.
const loadStory = cache(async (id: string) => {
  try {
    return await getStory(id);
  } catch (error) {
    // 400 is an id that is not even well-formed; both mean there is no such story.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
});

export async function generateMetadata({ params }: StoryPageProps) {
  const story = await loadStory((await params).id);
  return { title: story?.title ?? 'Story not found' };
}

export default async function StoryPage({ params, searchParams }: StoryPageProps) {
  const story = await loadStory((await params).id);
  if (!story) notFound();
  const autoStart = (await searchParams).summarize === '1';
  // A cluster summary draws on every member, so it names every member's sources; only HN and Dev.to feed a summary (hasSummaryInput).
  const sourceNames = [
    ...new Set(
      (story.cluster?.sources ?? story.sources)
        .filter((source) => SUMMARY_SOURCE_KINDS.has(source.kind))
        .map((source) => source.name),
    ),
  ];

  return (
    <article className="flex flex-col gap-8">
      <StoryHeader story={story} />
      {isFeatureEnabled('summaries') && (
        <SummaryPanel
          storyId={story.id}
          summary={story.summary ?? null}
          canSummarize={story.canSummarize ?? false}
          origin={{ url: story.url, domain: story.domain, sourceNames }}
          autoStart={autoStart}
        />
      )}
      {isFeatureEnabled('collections') && <StoryNote storyId={story.id} />}
      <SourceItemList items={story.items} />
      {isFeatureEnabled('clusters') && <ClusterMembers story={story} />}
    </article>
  );
}
