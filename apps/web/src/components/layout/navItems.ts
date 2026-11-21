import { BookmarkIcon, RadarIcon, RssIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { isFeatureEnabled, type FeatureFlag, type Features } from '@/config/features';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';

type NavItem = {
  label: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  shortcut: Shortcut;
  /** The item exists in the HTML only while this phase flag is on. */
  flag?: FeatureFlag;
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Feed',
    href: '/feed',
    Icon: RssIcon,
    shortcut: { id: 'go-feed', keys: 'g>f', description: 'Go to Feed', scope: 'Navigation' },
  },
  {
    label: 'Saved',
    href: '/saved',
    Icon: BookmarkIcon,
    shortcut: { id: 'go-saved', keys: 'g>s', description: 'Go to Saved', scope: 'Navigation' },
  },
  {
    label: 'Radar',
    href: '/radar',
    Icon: RadarIcon,
    flag: 'radar',
    shortcut: { id: 'go-radar', keys: 'g>r', description: 'Go to Radar', scope: 'Navigation' },
  },
];

export function getNavItems(features?: Features) {
  return NAV_ITEMS.filter((item) => !item.flag || isFeatureEnabled(item.flag, features));
}

/** `g` then `c`: Collections has no route of its own (§7.2), so it opens the collections overview on /saved, and no sidebar item. */
const GO_TO_COLLECTIONS = {
  href: '/saved',
  shortcut: {
    id: 'go-collections',
    keys: 'g>c',
    description: 'Go to Collections',
    scope: 'Navigation',
  },
} satisfies { href: string; shortcut: Shortcut };

/** Every `g` shortcut that applies: the sidebar items' and, with the collections flag on, Collections. */
export function getGoToTargets(features?: Features) {
  const targets: { href: string; shortcut: Shortcut }[] = getNavItems(features);
  return isFeatureEnabled('collections', features) ? [...targets, GO_TO_COLLECTIONS] : targets;
}
