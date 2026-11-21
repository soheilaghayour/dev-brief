import { describe, expect, it, vi } from 'vitest';
import { LazyCollectionBoard } from '@/components/collections/LazyCollectionBoard';
import CollectionPage from './page';

const flag = vi.hoisted(() => ({ collections: false }));
vi.mock('@/config/features', () => ({ isFeatureEnabled: () => flag.collections }));
vi.mock('@/components/collections/LazyCollectionBoard', () => ({
  LazyCollectionBoard: () => null,
}));

describe('/collections/[slug]', () => {
  it('AC-3.4.3 answers 404 while the collections flag is off', async () => {
    flag.collections = false;
    await expect(CollectionPage({ params: Promise.resolve({ slug: 'x' }) })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('AC-3.4.3 renders the board for the slug while the flag is on', async () => {
    flag.collections = true;
    const page = await CollectionPage({ params: Promise.resolve({ slug: 'reading-list' }) });
    expect(page.type).toBe(LazyCollectionBoard);
    expect(page.props).toEqual({ slug: 'reading-list' });
  });
});
