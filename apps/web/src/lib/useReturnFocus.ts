import { useState } from 'react';

/**
 * Hands focus back to what had it when the dialog opened (WCAG 2.4.3). Radix would use its trigger, but these dialogs
 * are mounted by state with no trigger, so the opener is the element it is told about or, failing that, the focused one as the dialog first renders.
 * An opener that has left the page (a row that was removed) gives way to `fallback`, when there is one.
 */
export function useReturnFocus(
  openedFrom?: Element | null,
  fallback?: () => HTMLElement | null | undefined,
) {
  const [opener] = useState(() => openedFrom ?? document.activeElement);
  return function returnFocus(event: Event) {
    event.preventDefault();
    const target = opener instanceof HTMLElement && opener.isConnected ? opener : fallback?.();
    target?.focus({ preventScroll: true });
  };
}
