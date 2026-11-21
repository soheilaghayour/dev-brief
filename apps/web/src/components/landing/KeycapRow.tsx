'use client';

import { useEffect, useRef, useState } from 'react';
import { isFeatureEnabled, type Features } from '@/config/features';
import { cn } from '@/lib/cn';
import { isEditableTarget } from '@/lib/hotkeys/shortcutRules';

type Keycap = { key: string; label: string; display?: string; isChord?: boolean };

const KEYCAPS: readonly Keycap[] = [
  { key: 'j', label: 'Next' },
  { key: 'k', label: 'Previous' },
  { key: 's', label: 'Save' },
  { key: '/', label: 'Search' },
  { key: '?', label: 'Help' },
];

const COMMAND_KEYCAP: Keycap = { key: 'k', display: '⌘K', label: 'Ask', isChord: true };

/** The keycaps shown while the flags allow: the copilot adds ⌘K. */
export function visibleKeycaps(features?: Features) {
  return isFeatureEnabled('copilot', features) ? [...KEYCAPS, COMMAND_KEYCAP] : KEYCAPS;
}

/** The keycap a key event presses: ⌘K or Ctrl+K lights the chord, a bare key lights its letter. */
export function pressedKeycap(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  keycaps: readonly Keycap[],
) {
  if (event.altKey) return undefined;
  const key = event.key.toLowerCase();
  const isChord = event.ctrlKey || event.metaKey;
  return keycaps.find((keycap) => keycap.key === key && Boolean(keycap.isChord) === isChord);
}

const PRESS_MS = 220;

/** The keycap row: it idles while in view and a pressed key lights its keycap. */
export function KeycapRow({ features }: { features?: Features }) {
  const keycaps = visibleKeycaps(features);
  const listRef = useRef<HTMLUListElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [pressedKey, setPressedKey] = useState<Keycap | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new IntersectionObserver(([entry]) =>
      setIsInView(Boolean(entry?.isIntersecting)),
    );
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView) return;
    let timer: ReturnType<typeof setTimeout>;
    function press(event: KeyboardEvent) {
      const keycap = pressedKeycap(event, keycaps);
      if (!keycap || (!keycap.isChord && isEditableTarget(event.target))) return;
      clearTimeout(timer);
      setPressedKey(keycap);
      timer = setTimeout(() => setPressedKey(null), PRESS_MS);
    }
    document.addEventListener('keydown', press);
    return () => {
      document.removeEventListener('keydown', press);
      clearTimeout(timer);
    };
  }, [isInView, keycaps]);

  return (
    <ul ref={listRef} className="flex flex-wrap justify-center gap-4">
      {keycaps.map((keycap, index) => (
        <li key={keycap.display ?? keycap.key} className="grid justify-items-center gap-3">
          <kbd
            data-pressed={pressedKey === keycap}
            style={{ animationDelay: `${index * 0.9}s` }}
            className={cn(
              'bg-card text-foreground flex size-16 items-center justify-center rounded-xl border border-b-4 font-mono text-2xl shadow-sm transition-all',
              'data-[pressed=true]:bg-primary data-[pressed=true]:text-primary-foreground data-[pressed=true]:translate-y-0.5 data-[pressed=true]:border-b',
              isInView && 'motion-safe:animate-[keycap-press_5s_ease-in-out_infinite]',
            )}
          >
            {keycap.display ?? keycap.key}
          </kbd>
          <span className="text-muted-foreground text-sm">{keycap.label}</span>
        </li>
      ))}
    </ul>
  );
}
