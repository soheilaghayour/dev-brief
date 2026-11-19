import { isHttpUrl } from '@/components/feed/feedNavigation';

export function openInNewTab(url: string) {
  if (isHttpUrl(url)) window.open(url, '_blank', 'noopener,noreferrer');
}

function findStoryElement(id: string) {
  return document.querySelector(`[data-story-id="${CSS.escape(id)}"]`);
}

export function scrollToStory(id: string, block: ScrollLogicalPosition) {
  findStoryElement(id)?.scrollIntoView({ block, behavior: 'instant' });
}

/** Moving DOM focus to the title link tells screen readers which card is active and gives a native focus ring. */
export function focusStory(id: string) {
  findStoryElement(id)?.querySelector('a')?.focus({ preventScroll: true });
}
