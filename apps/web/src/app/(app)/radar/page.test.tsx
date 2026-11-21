import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RadarRoute from './page';

vi.mock('@/features/radar/RadarPage', () => ({ RadarPage: () => <p>radar page</p> }));
vi.mock('@/lib/query/PrefetchedQueries', () => ({
  getServerQueryClient: () => ({ prefetchQuery: vi.fn() }),
  PrefetchedQueries: ({ children }: { children: React.ReactNode }) => children,
}));

describe('RadarRoute', () => {
  it('AC-L7 renders the radar with no flag involved', async () => {
    const page = await RadarRoute({ searchParams: Promise.resolve({}) });
    expect(renderToStaticMarkup(page)).toContain('radar page');
  });
});
