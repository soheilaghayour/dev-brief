import type { TagSlug } from '@devbrief/shared';
import { TAG_LABELS } from '@devbrief/shared';
import type { ComponentType } from 'react';
import type { PreferenceMenuProps } from '@/components/preferences/PreferenceMenu';
import { Badge } from '@/components/ui/Badge';
import { isFeatureEnabled } from '@/config/features';
import type { PreferenceKind } from '@/lib/guest/preferences';

type TagBadgeProps = {
  slug: TagSlug;
  /** The Follow / Mute menu the badge opens; passed in, so pages without one (the landing preview) don't load it. */
  menu?: ComponentType<PreferenceMenuProps<PreferenceKind>>;
};

export function TagBadge({ slug, menu: Menu }: TagBadgeProps) {
  const label = TAG_LABELS[slug];
  if (!Menu || !isFeatureEnabled('preferences')) return <Badge data-tag={slug}>{label}</Badge>;
  return (
    <Menu kind="tag" value={slug} label={label} variant="secondary" data={{ 'data-tag': slug }}>
      {label}
    </Menu>
  );
}
