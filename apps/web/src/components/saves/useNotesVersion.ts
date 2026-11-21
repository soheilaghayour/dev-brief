'use client';

import { useQueryCacheVersion } from '@/lib/useQueryCacheVersion';
import { isNoteQueryKey } from './accountNoteCache';

/** Re-renders a surface that shows notes when the caches that hold an account's notes change. */
export function useNotesVersion() {
  return useQueryCacheVersion(isNoteQueryKey);
}
