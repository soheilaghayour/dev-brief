'use client';

import { useRouter } from 'next/navigation';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import { getGoToTargets } from './navItems';

type GoToTarget = ReturnType<typeof getGoToTargets>[number];

function GoToShortcut({ target }: { target: GoToTarget }) {
  const router = useRouter();

  function goToTarget() {
    router.push(target.href);
  }

  useShortcut(target.shortcut, goToTarget);
  return null;
}

/** Binds `g` then a letter to every visible nav item and to Collections; mounted once, apart from the link lists. */
export function GoToShortcuts() {
  return getGoToTargets().map((target) => (
    <GoToShortcut key={target.shortcut.id} target={target} />
  ));
}
