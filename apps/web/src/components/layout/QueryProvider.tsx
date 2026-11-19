'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query/queryClient';

export function QueryProvider({ children }: { children: ReactNode }) {
  // State, not a module constant: each browser session (and each SSR request) needs its own cache.
  const [queryClient] = useState(makeQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
