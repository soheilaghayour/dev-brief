'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/Dialog';
import { useMe } from '@/lib/auth/useMe';
import { loadDeviceId } from '@/lib/guest/loadDeviceId';
import type { BriefingSource } from './BriefingView';
import { briefingBarReducer, initialBarState, type BriefingView } from './briefingBarReducer';
import {
  quotaExceededMessage,
  requestFailedMessage,
  SPEND_CAP_BANNER,
  STREAM_FAILED,
} from './copilotMessages';
import { LazyBriefingView } from './LazyBriefingView';
import { createLiveSource } from './liveBriefingSource';
import { QuestionInput } from './QuestionInput';
import { QuotaBadge } from './QuotaBadge';
import { StreamErrorNotice } from './StreamErrorNotice';
import { streamBriefing } from './streamBriefing';
import { SuggestionList } from './SuggestionList';

// The briefing's sticky title sits at the top of the scrolling results, not below the app header.
const RESULTS_STYLE = { '--briefing-sticky-top': '0px' } as CSSProperties;

/** What a screen reader hears while the answer is on its way. */
function progressAnnouncement(view: BriefingView) {
  if (view.status === 'streaming') return 'Generating your briefing…';
  if (view.status === 'done') return 'Your briefing is ready.';
  return '';
}

function showsBriefing(view: BriefingView) {
  return view.status === 'streaming' || view.status === 'done' || view.status === 'failed';
}

async function loadQuota(signal: AbortSignal) {
  const [{ getCopilotQuota }, deviceId] = await Promise.all([
    import('@/lib/api/endpoints'),
    loadDeviceId(),
  ]);
  return getCopilotQuota(deviceId, signal);
}

function CommandBarBody({ close }: { close: () => void }) {
  const [state, dispatch] = useReducer(briefingBarReducer, initialBarState);
  const [text, setText] = useState('');
  const [source, setSource] = useState<BriefingSource>();
  const running = useRef<AbortController>(null);
  const { data: user } = useMe();
  const { quota, view } = state;

  useEffect(() => {
    const controller = new AbortController();
    loadQuota(controller.signal)
      .then((loaded) => dispatch({ type: 'quotaLoaded', quota: loaded }))
      // Without the quota the badge stays hidden; asking still works and shows the API's own answer.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Closing the bar stops the stream, so the server refunds or settles it by its own rules.
  useEffect(() => () => running.current?.abort(), []);

  async function ask(question: string) {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const live = createLiveSource();
    setText(question);
    setSource(live.source);
    dispatch({ type: 'asked', question });
    try {
      const deviceId = await loadDeviceId();
      for await (const event of streamBriefing(
        { question, deviceId },
        { signal: controller.signal },
      )) {
        if (controller.signal.aborted) return;
        if (event.type === 'a2ui') live.push(event.message);
        dispatch(event);
      }
      if (!controller.signal.aborted) dispatch({ type: 'ended' });
    } catch (error) {
      if (!controller.signal.aborted) dispatch({ type: 'requestFailed', error });
    }
  }

  function askTyped() {
    void ask(text.trim());
  }

  function askQuestion(question: string) {
    void ask(question);
  }

  const isGuest = user === null;
  const hasSpendCapBanner =
    showsBriefing(view) && 'fallback' in view && view.fallback === 'SPEND_CAP';

  return (
    <>
      <div className="grid gap-3 border-b p-4">
        <div className="flex items-center justify-between gap-3 pr-8">
          <DialogTitle>Ask the News</DialogTitle>
          <QuotaBadge quota={quota} />
        </div>
        <DialogDescription className="sr-only">
          Ask a question about this week&apos;s tech news and watch a briefing stream in.
        </DialogDescription>
        <QuestionInput value={text} onChange={setText} onSubmit={askTyped} />
        <SuggestionList onPick={askQuestion} />
        <p role="status" className="sr-only">
          {progressAnnouncement(view)}
        </p>
      </div>
      <div style={RESULTS_STYLE} className="overflow-y-auto p-4">
        <div aria-live="polite" className="grid gap-3 empty:hidden">
          {view.status === 'quotaExceeded' && (
            <p className="text-sm">
              {quotaExceededMessage(view.resetsAt)}
              {isGuest && (
                <>
                  {' '}
                  <Link href="/sign-in" onClick={close} className="underline">
                    Sign in for 20 a day
                  </Link>
                </>
              )}
            </p>
          )}
          {hasSpendCapBanner && (
            <p className="bg-muted rounded-md px-3 py-2 text-sm">{SPEND_CAP_BANNER}</p>
          )}
        </div>
        {source && showsBriefing(view) && <LazyBriefingView source={source} />}
        {view.status === 'failed' && (
          <div className="mt-4">
            <StreamErrorNotice message={STREAM_FAILED} onRetry={() => askQuestion(view.question)} />
          </div>
        )}
        {view.status === 'error' && (
          <StreamErrorNotice
            message={requestFailedMessage(view.code)}
            onRetry={() => askQuestion(view.question)}
          />
        )}
      </div>
    </>
  );
}

type CopilotCommandBarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the bar closes. */
  onCloseAutoFocus: (event: Event) => void;
};

/** The ⌘K dialog: a question, three suggestions, the quota and the streamed briefing. */
export function CopilotCommandBar({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: CopilotCommandBarProps) {
  function close() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-w-2xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0"
      >
        <CommandBarBody close={close} />
      </DialogContent>
    </Dialog>
  );
}
