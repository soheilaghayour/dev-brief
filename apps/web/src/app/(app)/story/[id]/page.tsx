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

  return (
    <article className="flex flex-col gap-8">
      <StoryHeader story={story} />
      {isFeatureEnabled('summaries') && (
        <SummaryPanel storyId={story.id} summary={story.summary ?? null} autoStart={autoStart} />
      )}
      {isFeatureEnabled('collections') && <StoryNote storyId={story.id} />}
      <SourceItemList items={story.items} />
      {isFeatureEnabled('clusters') && <ClusterMembers story={story} />}
    </article>
  );
}
