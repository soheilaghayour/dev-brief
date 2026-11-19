'use client';

import { useRouter } from 'next/navigation';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import { getNavItems } from './navItems';

type NavItem = ReturnType<typeof getNavItems>[number];

function GoToShortcut({ item }: { item: NavItem }) {
  const router = useRouter();

  function goToItem() {
    router.push(item.href);
  }

  useShortcut(item.shortcut, goToItem);
  return null;
}

/** Binds `g` then a letter to every visible nav item; mounted once, apart from the link lists. */
export function GoToShortcuts() {
  return getNavItems().map((item) => <GoToShortcut key={item.shortcut.id} item={item} />);
}
