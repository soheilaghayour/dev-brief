import {
  ClusterDetailSchema,
  CopilotQuotaSchema,
  FeedPageSchema,
  HealthSchema,
  MeSchema,
  MergeResponseSchema,
  PreferencesSchema,
  RadarSchema,
  SaveIdsSchema,
  SaveSchema,
  SavedStoryPageSchema,
  SourceListSchema,
  StatsSchema,
  StoryDetailSchema,
  StoryLookupResponseSchema,
  StorySummarySchema,
  TagListSchema,
} from '@devbrief/shared';
import type {
  FeedQuery,
  MergeRequest,
  PaginationQuery,
  Preferences,
  RadarMetric,
  RadarWindow,
  StoryLookupRequest,
  TagSlug,
} from '@devbrief/shared';
import { createApiClient } from './apiClient';

const apiClient = createApiClient();

type FeedParams = Partial<FeedQuery>;
type RadarParams = { window: RadarWindow; metric: RadarMetric; tags?: readonly TagSlug[] };

export function getHealth() {
  return apiClient.request({ path: '/health' }, HealthSchema);
}

/** `isPerRequest: false` leaves the fetch cacheable, for statically generated pages. */
export function getFeed(params: FeedParams = {}, { isPerRequest = true } = {}) {
  // List params travel comma-separated (PRD §6.1).
  const query = Object.fromEntries(
    Object.entries(params).map(
      ([key, value]) => [key, Array.isArray(value) ? value.join(',') : value] as const,
    ),
  );
  // Per request by default: the feed's first page renders from fresh API data (PRD §8.4).
  const cache = isPerRequest ? 'no-store' : undefined;
  return apiClient.request({ path: '/feed', query, cache }, FeedPageSchema);
}

export function getStory(id: string) {
  return apiClient.request(
    { path: `/stories/${encodeURIComponent(id)}`, cache: 'no-store' },
    StoryDetailSchema,
  );
}

export function getCluster(id: string) {
  return apiClient.request({ path: `/clusters/${encodeURIComponent(id)}` }, ClusterDetailSchema);
}

export function lookupStories(body: StoryLookupRequest) {
  return apiClient.request(
    { method: 'POST', path: '/stories/lookup', body },
    StoryLookupResponseSchema,
  );
}

/** Asks for the story's summary: served from cache, or generated within the daily quota. */
export function summarizeStory(storyId: string, deviceId: string) {
  return apiClient.request(
    {
      method: 'POST',
      path: `/stories/${encodeURIComponent(storyId)}/summary`,
      body: { deviceId },
    },
    StorySummarySchema,
  );
}

export function getTags() {
  return apiClient.request({ path: '/tags' }, TagListSchema);
}

export function getStats() {
  return apiClient.request({ path: '/stats' }, StatsSchema);
}

export function getRadar({ window, metric, tags }: RadarParams) {
  // List params travel comma-separated (PRD §6.1).
  const query = { window, metric, tags: tags && tags.length > 0 ? tags.join(',') : undefined };
  return apiClient.request({ path: '/radar', query }, RadarSchema);
}

export function getSources() {
  return apiClient.request({ path: '/sources' }, SourceListSchema);
}

export function getMe({ cookie }: { cookie?: string } = {}) {
  return apiClient.request({ path: '/me', cookie }, MeSchema);
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

export function getPreferences({ cookie }: { cookie?: string } = {}) {
  return apiClient.request({ path: '/me/preferences', cookie }, PreferencesSchema);
}

export function putPreferences(body: Preferences) {
  return apiClient.request({ method: 'PUT', path: '/me/preferences', body }, PreferencesSchema);
}

/** What is left of today's copilot questions for this device (and the signed-in user, if any). */
export function getCopilotQuota(deviceId: string, signal?: AbortSignal) {
  return apiClient.request(
    { path: '/copilot/quota', query: { deviceId }, cache: 'no-store', signal },
    CopilotQuotaSchema,
  );
}
