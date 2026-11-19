import { TAXONOMY } from '@devbrief/shared';
import type { TagSlug } from '@devbrief/shared';

const LABELS = new Map<string, string>(TAXONOMY.map(({ slug, label }) => [slug, label]));

export function tagLabel(slug: TagSlug) {
  return LABELS.get(slug) ?? slug;
}
