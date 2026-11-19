import type { TagSlug } from '@devbrief/shared';
import { Badge } from '@/components/ui/Badge';
import { tagLabel } from './tagLabel';

export function TagBadge({ slug }: { slug: TagSlug }) {
  return <Badge data-tag={slug}>{tagLabel(slug)}</Badge>;
}
