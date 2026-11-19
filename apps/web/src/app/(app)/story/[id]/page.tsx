import { cache } from 'react';
import { notFound } from 'next/navigation';
import { SourceItemList } from '@/components/story/SourceItemList';
import { StoryHeader } from '@/components/story/StoryHeader';
import { ApiError } from '@/lib/api/apiError';
import { getStory } from '@/lib/api/endpoints';

type StoryPageProps = { params: Promise<{ id: string }> };

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

export default async function StoryPage({ params }: StoryPageProps) {
  const story = await loadStory((await params).id);
  if (!story) notFound();

  return (
    <article className="flex flex-col gap-8">
      <StoryHeader story={story} />
      <SourceItemList items={story.items} />
    </article>
  );
}
