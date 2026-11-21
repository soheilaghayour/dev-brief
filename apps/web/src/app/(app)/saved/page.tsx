import { LazyCollectionsSidebar } from '@/components/collections/LazyCollectionsSidebar';
import { SavedList } from '@/components/saves/SavedList';
import { isFeatureEnabled } from '@/config/features';

export const metadata = { title: 'Saved' };

export default function SavedPage() {
  return (
    <section>
      <h1 className="mb-4 text-lg font-semibold tracking-tight">Saved</h1>
      <div className="flex flex-col gap-6 md:flex-row">
        {isFeatureEnabled('collections') && <LazyCollectionsSidebar />}
        <div className="min-w-0 flex-1">
          <SavedList />
        </div>
      </div>
    </section>
  );
}
