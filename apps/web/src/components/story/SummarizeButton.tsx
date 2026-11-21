'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircleIcon, SparklesIcon } from 'lucide-react';
import type { StorySummary } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { useMe } from '@/lib/auth/useMe';
import { loadDeviceId } from '@/lib/guest/loadDeviceId';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';
import { summaryErrorMessage } from './summaryErrors';
import { SummaryView, type SummaryOrigin } from './SummaryView';

const SUMMARIZE_STORY = {
  id: 'story-summarize',
  keys: 'u',
  description: 'Summarize active story',
  scope: 'Story',
} satisfies Shortcut;

// Loaded on first use like the other queries: the endpoints pull in Zod, which first paint does not need.
async function requestSummary(storyId: string) {
  const [{ summarizeStory }, deviceId] = await Promise.all([
    import('@/lib/api/endpoints'),
    loadDeviceId(),
  ]);
  return summarizeStory(storyId, deviceId);
}

/** The Summarize button; on success the summary takes its place without a reload. */
export function SummarizeButton({
  storyId,
  origin,
  autoStart,
}: {
  storyId: string;
  origin: SummaryOrigin;
  autoStart: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const { data: user } = useMe();
  const summaryKey = ['summary', storyId];
  // Nothing fetches this query: the mutation primes it, and it never goes stale.
  const stored = useQuery<StorySummary>({
    queryKey: summaryKey,
    queryFn: skipToken,
    staleTime: Infinity,
  });
  const request = useMutation({
    mutationFn: () => requestSummary(storyId),
    onSuccess: (summary) => queryClient.setQueryData(summaryKey, summary),
  });
  const hasStarted = useRef(false);

  function summarize() {
    if (request.isPending || stored.data) return;
    request.mutate();
  }

  useShortcut(SUMMARIZE_STORY, summarize);

  useEffect(() => {
    if (!autoStart || hasStarted.current) return;
    hasStarted.current = true;
    summarize();
    // Without this a reload or back/forward would summarize again.
    router.replace(pathname, { scroll: false });
  });

  if (stored.data) return <SummaryView summary={stored.data} origin={origin} />;

  const failure = request.isError
    ? summaryErrorMessage(request.error, { isGuest: user === null })
    : null;
  return (
    <div className="flex max-w-3xl flex-col items-start gap-2">
      <Button
        variant="outline"
        aria-busy={request.isPending}
        disabled={request.isPending}
        onClick={summarize}
      >
        {request.isPending ? (
          <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
        ) : (
          <SparklesIcon aria-hidden="true" />
        )}
        Summarize
      </Button>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {failure?.message}
        {failure?.offersSignIn && (
          <>
            {' '}
            <Link href="/sign-in" className="text-foreground underline">
              Sign in for 20 a day
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
