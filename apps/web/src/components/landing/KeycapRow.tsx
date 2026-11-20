'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { isEditableTarget } from '@/lib/hotkeys/shortcutRules';

const KEYCAPS = [
  { key: 'j', label: 'Next' },
  { key: 'k', label: 'Previous' },
  { key: 's', label: 'Save' },
  { key: '/', label: 'Search' },
  { key: '?', label: 'Help' },
];

const PRESS_MS = 220;

/** The keycap row: it idles while in view and a pressed key lights its keycap. */
export function KeycapRow() {
  const listRef = useRef<HTMLUListElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);

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
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!KEYCAPS.some((keycap) => keycap.key === key)) return;
      clearTimeout(timer);
      setPressedKey(key);
      timer = setTimeout(() => setPressedKey(null), PRESS_MS);
    }
    document.addEventListener('keydown', press);
    return () => {
      document.removeEventListener('keydown', press);
      clearTimeout(timer);
    };
  }, [isInView]);

  return (
    <ul ref={listRef} className="flex flex-wrap justify-center gap-4">
      {KEYCAPS.map((keycap, index) => (
        <li key={keycap.key} className="grid justify-items-center gap-3">
          <kbd
            data-pressed={pressedKey === keycap.key}
            style={{ animationDelay: `${index * 0.9}s` }}
            className={cn(
              'bg-card text-foreground flex size-16 items-center justify-center rounded-xl border border-b-4 font-mono text-2xl shadow-sm transition-all',
              'data-[pressed=true]:bg-primary data-[pressed=true]:text-primary-foreground data-[pressed=true]:translate-y-0.5 data-[pressed=true]:border-b',
              isInView && 'motion-safe:animate-[keycap-press_5s_ease-in-out_infinite]',
            )}
          >
            {keycap.key}
          </kbd>
          <span className="text-muted-foreground text-sm">{keycap.label}</span>
        </li>
      ))}
    </ul>
  );
}
