'use client';

import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { hasActiveFilters } from './feedParams';
import { SOURCE_KIND_LABELS } from './sourceKinds';
import { TAG_LABELS } from '@devbrief/shared';
import { useFeedFilters } from './useFeedFilters';

type Chip = { key: string; label: string; remove: () => void };

function FilterChip({ label, remove }: Omit<Chip, 'key'>) {
  return (
    <Button variant="secondary" size="xs" aria-label={`Remove filter ${label}`} onClick={remove}>
      {label}
      <XIcon className="size-3" aria-hidden="true" />
    </Button>
  );
}

/** The applied tag, source and search filters as removable chips, plus "Clear all". */
export function ActiveFilters() {
  const { filters, toggleTag, toggleKind, removeSource, setQuery, clearAll } = useFeedFilters();
  if (!hasActiveFilters(filters)) return null;

  function clearQuery() {
    return setQuery('');
  }

  const chips: Chip[] = [
    ...filters.tags.map((tag) => ({
      key: `tag:${tag}`,
      label: TAG_LABELS[tag],
      remove: () => toggleTag(tag),
    })),
    ...filters.kinds.map((kind) => ({
      key: `kind:${kind}`,
      label: SOURCE_KIND_LABELS[kind],
      remove: () => toggleKind(kind),
    })),
    ...filters.sources.map((slug) => ({
      key: `source:${slug}`,
      label: slug,
      remove: () => removeSource(slug),
    })),
    ...(filters.q ? [{ key: 'q', label: `“${filters.q}”`, remove: clearQuery }] : []),
  ];

  return (
    <div
      role="group"
      aria-label="Active filters"
      className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2"
    >
      <span className="text-muted-foreground mr-1 text-xs">Filters</span>
      {chips.map(({ key, ...chip }) => (
        <FilterChip key={key} {...chip} />
      ))}
      <Button variant="ghost" size="xs" className="ml-auto" onClick={clearAll}>
        Clear all
      </Button>
    </div>
  );
}
