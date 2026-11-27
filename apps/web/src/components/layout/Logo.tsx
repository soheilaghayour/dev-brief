import Link from 'next/link';
import { DiamondIcon } from 'lucide-react';

export function Logo() {
  return (
    <Link
      href="/"
      // Next's client router stalls segment prefetches of the ISR `/`.
      prefetch={false}
      className="flex items-center gap-2 rounded-md font-semibold tracking-tight"
    >
      <DiamondIcon className="fill-brand stroke-brand size-4" aria-hidden="true" />
      <span className="text-base">DevBrief</span>
    </Link>
  );
}
