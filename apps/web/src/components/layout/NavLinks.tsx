'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { NAV_ITEMS } from './navItems';

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-8 items-center gap-2 rounded-md px-2 font-medium transition-colors',
              isActive && 'bg-accent text-accent-foreground',
            )}
          >
            <item.Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
