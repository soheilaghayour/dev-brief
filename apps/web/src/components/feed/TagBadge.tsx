import { TAG_LABELS, type TagSlug } from '@devbrief/shared';
import { Badge } from '@/components/ui/Badge';

export function TagBadge({ slug }: { slug: TagSlug }) {
  return <Badge data-tag={slug}>{TAG_LABELS[slug]}</Badge>;
}
