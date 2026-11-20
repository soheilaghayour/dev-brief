import type { TagSlug } from '@devbrief/shared';
import { TAG_LABELS } from '@devbrief/shared';
import { PreferenceMenu } from '@/components/preferences/PreferenceMenu';
import { Badge } from '@/components/ui/Badge';
import { isFeatureEnabled } from '@/config/features';

type TagBadgeProps = {
  slug: TagSlug;
  /** Opens Follow / Mute when clicked; off where preferences don't apply, like the landing preview. */
  hasMenu?: boolean;
};

export function TagBadge({ slug, hasMenu = false }: TagBadgeProps) {
  const label = TAG_LABELS[slug];
  if (!hasMenu || !isFeatureEnabled('preferences')) return <Badge data-tag={slug}>{label}</Badge>;
  return (
    <PreferenceMenu
      kind="tag"
      value={slug}
      label={label}
      variant="secondary"
      data={{ 'data-tag': slug }}
    >
      {label}
    </PreferenceMenu>
  );
}
