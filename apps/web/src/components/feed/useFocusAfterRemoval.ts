import { useEffect, useEffectEvent, useRef } from 'react';
import type { FocusEvent } from 'react';

/**
 * Moves focus to the story after one that held it and left the list (muted from its own menu), instead of letting it fall to the page.
 * Returns the handler for the list's `onFocusCapture`.
 */
export function useFocusAfterRemoval(
  stories: readonly { id: string }[],
  moveTo: (storyId: string) => void,
) {
  const focusedId = useRef<string | undefined>(undefined);
  const previousIds = useRef<string[]>([]);
  const move = useEffectEvent(moveTo);

  useEffect(() => {
    const before = previousIds.current;
    const ids = stories.map(({ id }) => id);
    previousIds.current = ids;
    const lostId = focusedId.current;
    if (!lostId || ids.includes(lostId) || !before.includes(lostId)) return;
    focusedId.current = undefined;
    // Focus that went somewhere real (a filter, a dialog) stays there.
    if (document.activeElement && document.activeElement !== document.body) return;
    const index = before.indexOf(lostId);
    const after = before.slice(index + 1);
    const earlier = before.slice(0, index).reverse();
    const nextId = [...after, ...earlier].find((id) => ids.includes(id));
    if (nextId) move(nextId);
  }, [stories]);

  return function trackFocus(event: FocusEvent) {
    const card = event.target instanceof Element ? event.target.closest('[data-story-id]') : null;
    if (card instanceof HTMLElement) focusedId.current = card.dataset.storyId;
  };
}
