import {
  FeedPageSchema,
  HealthSchema,
  MeSchema,
  MergeResponseSchema,
  SaveIdsSchema,
  SaveSchema,
  SavedStoryPageSchema,
  SourceListSchema,
  StoryDetailSchema,
  StoryLookupResponseSchema,
  TagListSchema,
} from '@devbrief/shared';
import type {
  FeedQuery,
  MergeRequest,
  PaginationQuery,
  StoryLookupRequest,
} from '@devbrief/shared';
import { createApiClient } from './apiClient';

const apiClient = createApiClient();

type FeedParams = Partial<FeedQuery>;

export function getHealth() {
  return apiClient.request({ path: '/health' }, HealthSchema);
}

export function getFeed({ tags, kinds, sources, ...rest }: FeedParams = {}) {
  const query = {
    ...rest,
    tags: tags?.join(','),
    kinds: kinds?.join(','),
    sources: sources?.join(','),
  };
  return apiClient.request({ path: '/feed', query }, FeedPageSchema);
}

export function getStory(id: string) {
  return apiClient.request({ path: `/stories/${encodeURIComponent(id)}` }, StoryDetailSchema);
}

export function lookupStories(body: StoryLookupRequest) {
  return apiClient.request(
    { method: 'POST', path: '/stories/lookup', body },
    StoryLookupResponseSchema,
  );
}

export function getTags() {
  return apiClient.request({ path: '/tags' }, TagListSchema);
}

export function getSources() {
  return apiClient.request({ path: '/sources' }, SourceListSchema);
}

export function getMe() {
  return apiClient.request({ path: '/me' }, MeSchema);
}

export function deleteMe() {
  return apiClient.requestNoContent({ method: 'DELETE', path: '/me' });
}

export function getSaves(query: Partial<PaginationQuery> = {}) {
  return apiClient.request({ path: '/me/saves', query }, SavedStoryPageSchema);
}

export function getSaveIds() {
  return apiClient.request({ path: '/me/saves/ids' }, SaveIdsSchema);
}

export function putSave(storyId: string) {
  return apiClient.request(
    { method: 'PUT', path: `/me/saves/${encodeURIComponent(storyId)}` },
    SaveSchema,
  );
}

export function deleteSave(storyId: string) {
  return apiClient.requestNoContent({
    method: 'DELETE',
    path: `/me/saves/${encodeURIComponent(storyId)}`,
  });
}

export function mergeSaves(body: MergeRequest) {
  return apiClient.request({ method: 'POST', path: '/me/merge', body }, MergeResponseSchema);
}
