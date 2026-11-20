import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export function FinalCtaBand() {
  return (
    <section aria-labelledby="cta-title" className="px-4 pb-20">
      <div className="from-primary/15 via-card to-card relative mx-auto max-w-6xl overflow-hidden rounded-2xl border bg-gradient-to-b px-6 py-16 text-center">
        <h2
          id="cta-title"
          className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
        >
          Your morning scan, in five minutes.
        </h2>
        <Button asChild size="lg" className="mt-8">
          <Link href="/feed">Explore the feed — no login required</Link>
        </Button>
      </div>
    </section>
  );
}
