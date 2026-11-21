import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RadarRoute from './page';

const features = vi.hoisted(() => ({ radar: false }));
vi.mock('@/config/features', () => ({ isFeatureEnabled: () => features.radar }));
const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => navigation);
vi.mock('@/features/radar/RadarPage', () => ({ RadarPage: () => <p>radar page</p> }));
vi.mock('@/lib/query/PrefetchedQueries', () => ({
  getServerQueryClient: () => ({ prefetchQuery: vi.fn() }),
  PrefetchedQueries: ({ children }: { children: React.ReactNode }) => children,
}));

const render = () => RadarRoute({ searchParams: Promise.resolve({}) });

beforeEach(() => {
  features.radar = false;
  navigation.notFound.mockClear();
});

describe('RadarRoute', () => {
  it('AC-L7 answers 404 while the radar flag is off', async () => {
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(navigation.notFound).toHaveBeenCalled();
  });

  it('AC-L7 renders the radar while the flag is on', async () => {
    features.radar = true;
    expect(renderToStaticMarkup(await render())).toContain('radar page');
    expect(navigation.notFound).not.toHaveBeenCalled();
  });
});
