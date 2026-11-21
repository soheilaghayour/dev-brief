import { useId } from 'react';
import type { MouseEvent } from 'react';
import Link from 'next/link';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { createComponentImplementation, type ReactCatalogComponent } from '@a2ui/react';
import { Catalog, CommonSchemas } from '@a2ui/web_core/v1_0';
import { ALLOWED_PARENTS, DEVBRIEF_CATALOG_ID, DevBriefComponents } from '@devbrief/shared';
import { RelativeTime } from '@/components/feed/RelativeTime';
import { SourceBadge } from '@/components/feed/SourceBadge';
import { TagBadge } from '@/components/feed/TagBadge';
import { TechVelocityChart } from '@/components/radar/TechVelocityChart';
import { ConsensusCallout } from '@/components/story/ConsensusCallout';
import { Button } from '@/components/ui/Button';

// Each API takes its prop schema from the shared catalog; only the binding-aware types differ.
const BriefingApi = {
  name: 'Briefing',
  allowedParents: ALLOWED_PARENTS.Briefing,
  schema: DevBriefComponents.Briefing.extend({
    title: CommonSchemas.DynamicString,
    subtitle: CommonSchemas.DynamicString.optional(),
    children: CommonSchemas.ChildList,
  }),
};

const KeyTakeawaysApi = {
  name: 'KeyTakeaways',
  allowedParents: ALLOWED_PARENTS.KeyTakeaways,
  schema: DevBriefComponents.KeyTakeaways,
};
const StoryClusterCardApi = {
  name: 'StoryClusterCard',
  allowedParents: ALLOWED_PARENTS.StoryClusterCard,
  schema: DevBriefComponents.StoryClusterCard,
};
const ConsensusCalloutApi = {
  name: 'ConsensusCallout',
  allowedParents: ALLOWED_PARENTS.ConsensusCallout,
  schema: DevBriefComponents.ConsensusCallout,
};
const TechVelocityChartApi = {
  name: 'TechVelocityChart',
  allowedParents: ALLOWED_PARENTS.TechVelocityChart,
  schema: DevBriefComponents.TechVelocityChart,
};
const TagBadgeListApi = {
  name: 'TagBadgeList',
  allowedParents: ALLOWED_PARENTS.TagBadgeList,
  schema: DevBriefComponents.TagBadgeList,
};

/** The briefing's own element: a chip finds the card it cites inside it, never elsewhere on the page. */
const BRIEFING_ATTRIBUTE = 'data-briefing';

/** A model-supplied URL becomes a link only when it is http(s): `javascript:` also passes a URL schema. */
function isHttpUrl(url: string) {
  return url.startsWith('https://') || url.startsWith('http://');
}

function focusCitedCard(event: MouseEvent<HTMLButtonElement>, storyId: string) {
  const briefing = event.currentTarget.closest(`[${BRIEFING_ATTRIBUTE}]`);
  const cards = briefing?.querySelectorAll<HTMLElement>('[data-story-id]') ?? [];
  const card = [...cards].find((candidate) => candidate.dataset.storyId === storyId);
  card?.scrollIntoView({ block: 'center' });
  card?.focus();
}

/** Footnote numbers in first-citation order across all takeaways. */
function footnoteNumbers(items: readonly { storyIds: readonly string[] }[]) {
  const numbers = new Map<string, number>();
  for (const { storyIds } of items)
    for (const storyId of storyIds)
      if (!numbers.has(storyId)) numbers.set(storyId, numbers.size + 1);
  return numbers;
}

const Briefing = createComponentImplementation(BriefingApi, ({ props, buildChild }) => (
  <div data-briefing="" className="flex flex-col gap-6">
    <header className="bg-background sticky top-14 z-30 border-b py-3">
      <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
      {props.subtitle && <p className="text-muted-foreground text-sm">{props.subtitle}</p>}
    </header>
    {props.children.map((child) => {
      const { id, basePath } = typeof child === 'string' ? { id: child, basePath: '/' } : child;
      return <div key={id}>{buildChild(id, basePath)}</div>;
    })}
  </div>
));

const KeyTakeaways = createComponentImplementation(KeyTakeawaysApi, ({ props }) => {
  const headingId = useId();
  const numbers = footnoteNumbers(props.items);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-lg font-semibold">
        {props.title}
      </h2>
      <ol className="list-decimal space-y-2 pl-6">
        {props.items.map((item) => (
          <li key={item.text} className="leading-relaxed">
            {item.text}{' '}
            {item.storyIds.map((storyId) => (
              <Button
                key={storyId}
                variant="outline"
                size="xs"
                className="h-5 px-1.5 align-baseline"
                aria-label={`Go to source ${numbers.get(storyId)}`}
                onClick={(event) => focusCitedCard(event, storyId)}
              >
                [{numbers.get(storyId)}]
              </Button>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
});

const StoryClusterCard = createComponentImplementation(StoryClusterCardApi, ({ props }) => (
  <article
    data-story-id={props.storyId}
    tabIndex={-1}
    className="focus-visible:ring-ring scroll-mt-28 rounded-lg border p-3 outline-none focus-visible:ring-2"
  >
    <h3 className="leading-snug">
      <Link href={`/story/${props.storyId}`} className="text-base font-medium hover:underline">
        {props.title}
      </Link>
      {isHttpUrl(props.url) ? (
        <a
          href={props.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground ml-2 text-xs hover:underline"
        >
          {props.domain}
        </a>
      ) : (
        <span className="text-muted-foreground ml-2 text-xs">{props.domain}</span>
      )}
    </h3>
    <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {props.sources.map((source) => (
        <SourceBadge
          key={`${source.kind}:${source.url}`}
          source={{ ...source, slug: source.label, name: source.label }}
        />
      ))}
      <RelativeTime iso={props.publishedAt} />
      {props.tags.map((tag) => (
        <TagBadge key={tag} slug={tag} />
      ))}
    </div>
    {props.tldr && props.tldr.length > 0 && (
      <ul aria-label="TL;DR" className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {props.tldr.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    )}
    {props.note && <p className="text-muted-foreground mt-2 text-sm italic">{props.note}</p>}
  </article>
));

const ConsensusCalloutView = createComponentImplementation(ConsensusCalloutApi, ({ props }) => (
  <ConsensusCallout
    topic={props.topic}
    verdict={props.verdict}
    pros={props.pros.map(({ point }) => point)}
    cons={props.cons.map(({ point }) => point)}
    openQuestions={props.openQuestions}
  />
));

const TechVelocityChartView = createComponentImplementation(TechVelocityChartApi, ({ props }) => (
  <TechVelocityChart
    title={props.title}
    window={props.window}
    metric={props.metric}
    series={props.series}
  />
));

function Delta({ deltaPct }: { deltaPct: number }) {
  const isUp = deltaPct >= 0;
  const Icon = isUp ? TrendingUpIcon : TrendingDownIcon;
  // A real minus sign, so the text reads as the PRD writes it.
  const text = `${isUp ? '+' : '−'}${Math.abs(Math.round(deltaPct))}%`;
  return (
    <span className="text-muted-foreground inline-flex items-center gap-0.5 text-xs tabular-nums">
      <Icon className="size-3" aria-hidden="true" />
      {text}
    </span>
  );
}

const TagBadgeListView = createComponentImplementation(TagBadgeListApi, ({ props }) => {
  const headingId = useId();
  return (
    <section aria-labelledby={props.title ? headingId : undefined} className="flex flex-col gap-2">
      {props.title && (
        <h2 id={headingId} className="text-lg font-semibold">
          {props.title}
        </h2>
      )}
      <ul className="flex flex-wrap gap-2">
        {props.tags.map(({ slug, deltaPct }) => (
          <li key={slug} className="flex items-center gap-1">
            <Link href={`/feed?tags=${slug}`} className="rounded-sm hover:underline">
              <TagBadge slug={slug} />
            </Link>
            {deltaPct !== undefined && <Delta deltaPct={deltaPct} />}
          </li>
        ))}
      </ul>
    </section>
  );
});

const components: ReactCatalogComponent[] = [
  Briefing,
  KeyTakeaways,
  StoryClusterCard,
  ConsensusCalloutView,
  TechVelocityChartView,
  TagBadgeListView,
];

/** DevBrief's A2UI catalog; the only one the briefing renderer registers. */
export const devbriefCatalog = new Catalog(DEVBRIEF_CATALOG_ID, '1.0', components);
