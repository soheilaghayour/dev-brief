import { createLoader, parseAsArrayOf, parseAsString, parseAsStringLiteral } from 'nuqs/server';
import { RADAR_METRICS, RADAR_TAGS_MAX, RADAR_WINDOWS, TAG_SLUGS } from '@devbrief/shared';
import type { RadarMetric, RadarWindow, TagSlug } from '@devbrief/shared';

/** The URL is the only source of truth for the radar's controls; defaults are omitted from it. */
export const radarSearchParams = {
  window: parseAsStringLiteral(RADAR_WINDOWS).withDefault('7d'),
  metric: parseAsStringLiteral(RADAR_METRICS).withDefault('stories'),
  tags: parseAsArrayOf(parseAsString).withDefault([]),
};

export const loadRadarSearchParams = createLoader(radarSearchParams);

export type RadarFilters = { window: RadarWindow; metric: RadarMetric; tags: TagSlug[] };

type RawRadarFilters = { window: RadarWindow; metric: RadarMetric; tags: string[] };

function isTagSlug(value: string): value is TagSlug {
  return (TAG_SLUGS as readonly string[]).includes(value);
}

/** Drops URL tags the API would reject and keeps the first five, so a hand-edited URL never produces a 400. */
export function toRadarFilters({ window, metric, tags }: RawRadarFilters): RadarFilters {
  return { window, metric, tags: [...new Set(tags.filter(isTagSlug))].slice(0, RADAR_TAGS_MAX) };
}
