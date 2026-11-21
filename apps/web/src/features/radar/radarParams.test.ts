import { describe, expect, it } from 'vitest';
import { loadRadarSearchParams, toRadarFilters } from './radarParams';

describe('toRadarFilters', () => {
  it('AC-3.3.1 reads the defaults from an empty URL', () => {
    expect(toRadarFilters(loadRadarSearchParams({}))).toEqual({
      window: '7d',
      metric: 'stories',
      tags: [],
    });
  });

  it('drops unknown and repeated tags and keeps at most five, so the API never answers 400', () => {
    const filters = toRadarFilters(
      loadRadarSearchParams({
        window: '30d',
        tags: 'rust,rust,nope,vue,go,react,typescript,ai-llms',
      }),
    );
    expect(filters).toEqual({
      window: '30d',
      metric: 'stories',
      tags: ['rust', 'vue', 'go', 'react', 'typescript'],
    });
  });

  it('falls back to the default window for a value outside 7d and 30d', () => {
    expect(toRadarFilters(loadRadarSearchParams({ window: '90d' })).window).toBe('7d');
  });
});
