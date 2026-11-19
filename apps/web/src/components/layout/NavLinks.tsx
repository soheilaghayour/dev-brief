'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Features } from '@/config/features';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/cn';
import { displayKeys } from '@/lib/hotkeys/shortcutRules';
import { getNavItems } from './navItems';

export function NavLinks({ features }: { features?: Features }) {
  const pathname = usePathname();
  const items = getNavItems(features);

  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {items.map((item) => {
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
            <span className="flex-1">{item.label}</span>
            <span className="flex gap-0.5" aria-hidden="true">
              {displayKeys(item.shortcut.keys).map((key, index) => (
                <Kbd key={index} size="sm">
                  {key}
                </Kbd>
              ))}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
