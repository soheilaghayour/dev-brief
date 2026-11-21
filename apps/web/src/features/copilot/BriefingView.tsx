'use client';

import { useEffect, useState } from 'react';
import { A2uiSurface, type ReactCatalogComponent } from '@a2ui/react';
import { MessageProcessor, type Subscription, type SurfaceModel } from '@a2ui/web_core/v1_0';
import { A2uiServerMessageSchema } from '@devbrief/shared';
import { BriefingSkeleton } from './BriefingSkeleton';
import { devbriefCatalog } from './catalog';

/** Where a briefing's messages come from: a live stream or a stored array that replays on subscribe. */
export type BriefingSource = {
  subscribe: (push: (message: unknown) => void) => () => void;
};

type Surface = SurfaceModel<ReactCatalogComponent>;

type BriefingState = { status: 'waiting' } | { status: 'ready'; surface: Surface };

/** One processor per source: it parses every message (A2UI is untrusted, PRD §8.6) and reports the surface once its `root` exists. */
function useBriefingState(source: BriefingSource) {
  const [state, setState] = useState<BriefingState>({ status: 'waiting' });

  useEffect(() => {
    const processor = new MessageProcessor<ReactCatalogComponent>([devbriefCatalog]);
    const subscriptions: Subscription[] = [];

    function showWhenRooted(surface: Surface) {
      if (surface.componentsModel.has('root')) return setState({ status: 'ready', surface });
      const waiting = surface.componentsModel.onCreated.subscribe((component) => {
        if (component.id !== 'root') return;
        waiting.unsubscribe();
        setState({ status: 'ready', surface });
      });
      subscriptions.push(waiting);
    }

    function receive(message: unknown) {
      const parsed = A2uiServerMessageSchema.safeParse(message);
      if (parsed.success) processor.processMessagesWithErrors(parsed.data);
    }

    subscriptions.push(
      processor.onSurfaceCreated(showWhenRooted),
      processor.onSurfaceDeleted(() => setState({ status: 'waiting' })),
    );
    const unsubscribeSource = source.subscribe(receive);

    return () => {
      unsubscribeSource();
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      processor.dispose();
    };
  }, [source]);

  return state;
}

/** Renders one A2UI briefing with the DevBrief catalog: the skeleton until `root` arrives, then the sections as they stream in. */
export default function BriefingView({ source }: { source: BriefingSource }) {
  const state = useBriefingState(source);
  if (state.status === 'waiting') return <BriefingSkeleton />;
  return <A2uiSurface surface={state.surface} />;
}
