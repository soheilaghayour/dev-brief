function findStoryElement(id: string) {
  return document.querySelector(`[data-story-id="${CSS.escape(id)}"]`);
}

/** Moves DOM focus to the card's title link, which gives a native focus ring and tells screen readers where focus is. */
export function focusStory(id: string) {
  findStoryElement(id)?.querySelector('a')?.focus({ preventScroll: true });
}
