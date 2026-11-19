import type { Save, StoryCard, StoryLookupRequest, StoryLookupResponse } from '@devbrief/shared';

/** The most ids one lookup request accepts. */
export const LOOKUP_CHUNK_SIZE = 100;

export function chunkIds(ids: readonly string[], size = LOOKUP_CHUNK_SIZE) {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += size)
    chunks.push(ids.slice(start, start + size));
  return chunks;
}

/** Looks the ids up in chunks of at most 100 and joins the answers. */
export async function lookupInChunks(
  ids: readonly string[],
  lookup: (request: StoryLookupRequest) => Promise<StoryLookupResponse>,
): Promise<StoryLookupResponse> {
  const responses = await Promise.all(chunkIds(ids).map((chunk) => lookup({ ids: chunk })));
  return {
    items: responses.flatMap((response) => response.items),
    missingIds: responses.flatMap((response) => response.missingIds),
  };
}

/** The saved stories in the saves' order; a save whose story was not found is left out. */
export function orderSavedStories(saves: readonly Save[], stories: readonly StoryCard[]) {
  const byId = new Map(stories.map((story) => [story.id, story]));
  return saves.flatMap(({ storyId }) => byId.get(storyId) ?? []);
}

export function unavailableNotice(count: number) {
  return count === 1
    ? '1 saved story is no longer available and was removed.'
    : `${count} saved stories are no longer available and were removed.`;
}
