import Link from 'next/link';
import { DiamondIcon } from 'lucide-react';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight">
      <DiamondIcon className="text-primary size-4 fill-current" aria-hidden="true" />
      <span className="text-base">DevBrief</span>
    </Link>
  );
}
