import { BookmarkIcon, RadarIcon, RssIcon } from 'lucide-react';
import type { ComponentType } from 'react';

type NavItem = {
  label: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Feed', href: '/feed', Icon: RssIcon },
  { label: 'Saved', href: '/saved', Icon: BookmarkIcon },
  { label: 'Radar', href: '/radar', Icon: RadarIcon },
];
