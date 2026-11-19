import type { TagSlug } from '@devbrief/shared';
import { Badge } from '@/components/ui/Badge';
import { TAG_LABELS } from '@devbrief/shared';

export function TagBadge({ slug }: { slug: TagSlug }) {
  return <Badge data-tag={slug}>{TAG_LABELS[slug]}</Badge>;
}
