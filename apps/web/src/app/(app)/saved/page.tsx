import { SavedList } from '@/components/saves/SavedList';

export const metadata = { title: 'Saved' };

export default function SavedPage() {
  return (
    <section>
      <h1 className="mb-4 text-lg font-semibold tracking-tight">Saved</h1>
      <SavedList />
    </section>
  );
}
