import type { ReactNode } from 'react';
import { BookmarkIcon, FolderIcon, SparklesIcon } from 'lucide-react';
import { isFeatureEnabled, type FeatureFlag, type Features } from '@/config/features';
import { SectionHeading } from './SectionHeading';

type BentoTile = {
  title: string;
  text: string;
  visual: ReactNode;
  /** The tile exists in the HTML only while this feature flag is on. */
  flag?: FeatureFlag;
};

// Every animation is motion-safe, so nothing loops under prefers-reduced-motion.
function GuestVisual() {
  return (
    <div aria-hidden="true" className="grid gap-2 text-xs">
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <span className="text-muted-foreground">Edge runtimes, compared</span>
        <BookmarkIcon className="text-foreground size-3.5 fill-current motion-safe:animate-[bento-pop_5s_ease-in-out_infinite]" />
      </div>
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2">
        Saved on this device · Sign in to sync
      </p>
    </div>
  );
}

function RankingVisual() {
  const labels = ['HN', 'Dev.to', 'GitHub'];
  return (
    <div aria-hidden="true" className="grid gap-3 text-xs">
      {labels.map((label, index) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-muted-foreground w-12 font-mono">{label}</span>
          <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
            <div
              style={{ animationDelay: `${index * 0.4}s` }}
              className="bg-brand/70 absolute inset-y-0 left-0 w-3/5 origin-left rounded-full motion-safe:animate-[bento-grow_5s_ease-in-out_infinite]"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AskVisual() {
  return (
    <div aria-hidden="true" className="grid gap-2 text-xs">
      <p className="text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2">
        <SparklesIcon className="size-3.5 motion-safe:animate-[bento-pop_5s_ease-in-out_infinite]" />
        What were this week&apos;s TypeScript tooling debates?
      </p>
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2">
        Key takeaways · Story cards · Community consensus
      </p>
    </div>
  );
}

function RadarVisual() {
  const rows = [
    { label: 'Rust', delta: '▲ +52%', width: 'w-4/5' },
    { label: 'TypeScript', delta: '▲ +12%', width: 'w-3/5' },
    { label: 'Vue', delta: '▼ −28%', width: 'w-2/5' },
  ];
  return (
    <div aria-hidden="true" className="grid gap-3 text-xs">
      {rows.map(({ label, delta, width }, index) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-muted-foreground w-20 font-mono">{label}</span>
          <div className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
            <div
              style={{ animationDelay: `${index * 0.4}s` }}
              className={`bg-brand/70 absolute inset-y-0 left-0 ${width} origin-left rounded-full motion-safe:animate-[bento-grow_5s_ease-in-out_infinite]`}
            />
          </div>
          <span className="text-muted-foreground w-16 text-right font-mono">{delta}</span>
        </div>
      ))}
    </div>
  );
}

function CollectionsVisual() {
  const boards = [
    { name: 'Frontend Architecture', count: 12 },
    { name: 'Interview prep', count: 7 },
  ];
  return (
    <div aria-hidden="true" className="grid gap-2 text-xs">
      {boards.map(({ name, count }) => (
        <div key={name} className="flex items-center gap-2 rounded-md border px-3 py-2">
          <FolderIcon className="text-muted-foreground size-3.5" />
          <span className="flex-1">{name}</span>
          <span className="text-muted-foreground font-mono">{count}</span>
        </div>
      ))}
      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2">
        Try on the dashboard repo; check memo removal…
      </p>
    </div>
  );
}

const TILES: readonly BentoTile[] = [
  {
    title: 'Guest mode, real features',
    text: 'Save, filter and share links without an account. Sign in later and your saves follow you.',
    visual: <GuestVisual />,
  },
  {
    title: 'Fair cross-source ranking',
    text: 'Engagement is scored within each source, so a Dev.to post is not buried under Hacker News points.',
    visual: <RankingVisual />,
  },
  {
    title: 'Ask the News',
    text: 'Ask a question and get a briefing of real story cards, takeaways and the community consensus, not a wall of text.',
    visual: <AskVisual />,
    flag: 'copilot',
  },
  {
    title: 'Tech Radar',
    text: 'See which technologies are gaining or losing attention over 7 and 30 days, by stories or engagement.',
    visual: <RadarVisual />,
  },
  {
    title: 'Collections & notes',
    text: 'Group saved stories into boards and keep a note on each. Guests keep them on the device, and signing in syncs them.',
    visual: <CollectionsVisual />,
    flag: 'collections',
  },
];

/** The bento tiles whose feature flag is on. */
export function visibleTiles(features?: Features) {
  return TILES.filter((tile) => !tile.flag || isFeatureEnabled(tile.flag, features));
}

// Column spans (of 3, from md up) by tile count, so a flag that is off never leaves a lone tile in a row.
const SPAN_CLASSES = ['md:col-span-1', 'md:col-span-2', 'md:col-span-3'] as const;
const SPANS_BY_COUNT: Record<number, readonly (1 | 2 | 3)[]> = {
  3: [1, 1, 1],
  4: [1, 2, 2, 1],
  5: [1, 2, 1, 1, 1],
};

/** How many of the grid's 3 columns each of `count` tiles spans, in order. */
export function tileSpans(count: number) {
  return SPANS_BY_COUNT[count] ?? Array.from({ length: count }, () => 3 as const);
}

export function FeatureBento() {
  const tiles = visibleTiles();
  const spans = tileSpans(tiles.length);
  return (
    <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHeading
        id="features-title"
        eyebrow="Features"
        title="Built for the way engineers read"
      />
      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((tile, index) => (
          <article
            key={tile.title}
            className={`bg-card hover:border-brand/40 grid content-between gap-6 rounded-lg border p-6 transition-colors ${SPAN_CLASSES[spans[index]! - 1]}`}
          >
            <div>
              <h3 className="text-lg font-semibold tracking-tight">{tile.title}</h3>
              <p className="text-muted-foreground mt-2 text-base">{tile.text}</p>
            </div>
            {tile.visual}
          </article>
        ))}
      </div>
    </section>
  );
}
