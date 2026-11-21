import { notFound } from 'next/navigation';
import { LazyCollectionBoard } from '@/components/collections/LazyCollectionBoard';
import { isFeatureEnabled } from '@/config/features';

export const metadata = { title: 'Collection' };

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isFeatureEnabled('collections')) notFound();
  const { slug } = await params;
  // Keyed by slug, so moving between boards starts each one's story lookup afresh.
  return <LazyCollectionBoard key={slug} slug={slug} />;
}
