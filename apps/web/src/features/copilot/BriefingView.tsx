'use client';

import { Component, useEffect, useState, type ReactNode } from 'react';
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

/** The rooted surface, tagged with the source it came from, so a new source never shows the old one's surface. */
type ReadySurface = { source: BriefingSource; surface: Surface };

/** One processor per source: it parses every message (A2UI is untrusted, PRD §8.6) and returns the surface once its `root` exists. */
function useRootedSurface(source: BriefingSource) {
  const [ready, setReady] = useState<ReadySurface>();

  useEffect(() => {
    const processor = new MessageProcessor<ReactCatalogComponent>([devbriefCatalog]);
    const subscriptions: Subscription[] = [];

    function showWhenRooted(surface: Surface) {
      if (surface.componentsModel.has('root')) return setReady({ source, surface });
      const waiting = surface.componentsModel.onCreated.subscribe((component) => {
        if (component.id !== 'root') return;
        waiting.unsubscribe();
        setReady({ source, surface });
      });
      subscriptions.push(waiting);
    }

    function receive(message: unknown) {
      const parsed = A2uiServerMessageSchema.safeParse(message);
      if (parsed.success) processor.processMessagesWithErrors(parsed.data);
    }

    subscriptions.push(
      processor.onSurfaceCreated(showWhenRooted),
      processor.onSurfaceDeleted((surfaceId) =>
        setReady((current) => (current?.surface.id === surfaceId ? undefined : current)),
      ),
    );
    const unsubscribeSource = source.subscribe(receive);

    return () => {
      unsubscribeSource();
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      processor.dispose();
    };
  }, [source]);

  return ready?.source === source ? ready.surface : undefined;
}

/** A surface that throws while rendering (a malformed prop from the model) shows a calm line instead of taking the page down. */
class BriefingErrorBoundary extends Component<
  { surface: Surface; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previous: { surface: Surface }) {
    if (this.state.hasError && previous.surface !== this.props.surface)
      this.setState({ hasError: false });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <p className="text-muted-foreground text-sm">This briefing couldn&apos;t be displayed</p>
    );
  }
}

/** Renders one A2UI briefing with the DevBrief catalog: the skeleton until `root` arrives, then the sections as they stream in. */
export default function BriefingView({ source }: { source: BriefingSource }) {
  const surface = useRootedSurface(source);
  if (!surface) return <BriefingSkeleton />;
  return (
    <BriefingErrorBoundary surface={surface}>
      <A2uiSurface surface={surface} />
    </BriefingErrorBoundary>
  );
}
