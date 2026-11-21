// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageProcessor } from '@a2ui/web_core/v1_0';
import {
  A2uiServerMessageSchema,
  DEVBRIEF_CATALOG_ID,
  type A2uiServerMessage,
} from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import BriefingView, { type BriefingSource } from './BriefingView';
import { SECTION_SIGNATURES } from './sectionSignatures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Recharts needs real layout; the stub shows that the lazy module arrived.
const chart = vi.hoisted(() => ({ throws: false }));
vi.mock('@/components/radar/VelocityLines', () => ({
  default: () => {
    if (chart.throws) throw new Error('chart exploded');
    return <div data-testid="lines" />;
  },
}));

const SURFACE_ID = 'briefing-cbriefq0ts001';
const MESSAGES = A2uiServerMessageSchema.array().parse(tsToolingBriefing);

/** A source the test pushes into by hand, like the command bar's live stream. */
function manualSource() {
  const listeners = new Set<(message: unknown) => void>();
  const source: BriefingSource = {
    subscribe: (push) => {
      listeners.add(push);
      return () => listeners.delete(push);
    },
  };
  return { source, listeners, push: (message: unknown) => listeners.forEach((l) => l(message)) };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  // jsdom has no layout, so scrolling is a no-op to observe.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  chart.throws = false;
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderView(source: BriefingSource) {
  await act(async () => root.render(<BriefingView source={source} />));
}

async function send(push: (message: unknown) => void, message: unknown) {
  await act(async () => push(message));
}

async function renderCompleteBriefing() {
  const { source, push } = manualSource();
  await renderView(source);
  for (const message of MESSAGES) await send(push, message);
}

/** The component names of the latest root's children, in order, from the messages sent so far. */
function expectedSectionKinds(messages: readonly A2uiServerMessage[]) {
  const entries = messages.flatMap((message) =>
    'updateComponents' in message ? message.updateComponents.components : [],
  );
  const latestRoot = entries.findLast((entry) => entry.id === 'root');
  const childIds = latestRoot?.component === 'Briefing' ? latestRoot.children : [];
  return childIds.map((id) => entries.findLast((entry) => entry.id === id)?.component);
}

const renderedSections = () => [...container.querySelectorAll('[data-briefing] > div')];

function sectionKind(section: Element) {
  return Object.entries(SECTION_SIGNATURES).find(([, selector]) =>
    section.querySelector(selector),
  )?.[0];
}

describe('BriefingView', () => {
  it('AC-3.1.2 shows the skeleton until root arrives, then each section in root.children order', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    expect(container.querySelector('[role="status"]')).not.toBeNull();

    const seen: A2uiServerMessage[] = [];
    for (const message of MESSAGES) {
      seen.push(message);
      await send(push, message);
      const hasRoot = seen.some(
        (seenMessage) =>
          'updateComponents' in seenMessage &&
          seenMessage.updateComponents.components.some((entry) => entry.id === 'root'),
      );
      expect(container.querySelector('[role="status"]') === null).toBe(hasRoot);
      if (hasRoot) {
        expect(container.querySelector('header h2')?.textContent).toBe(
          "TypeScript tooling: this week's debates",
        );
        // Components land in the order of root.children, and an arrived section is not empty.
        expect(renderedSections().map(sectionKind)).toEqual(expectedSectionKinds(seen));
      }
    }
    expect(container.querySelector('header h2')?.nextElementSibling?.textContent).toContain(
      'Based on 14 stories',
    );
  });

  it('AC-3.1.10 links every story card to /story/[id] and every tag badge to /feed?tags=<slug>', async () => {
    await renderCompleteBriefing();
    const storyIds = MESSAGES.flatMap((message) =>
      'updateComponents' in message
        ? message.updateComponents.components.flatMap((entry) =>
            entry.component === 'StoryClusterCard' ? [entry.storyId] : [],
          )
        : [],
    );
    const tagSlugs = MESSAGES.flatMap((message) =>
      'updateComponents' in message
        ? message.updateComponents.components.flatMap((entry) =>
            entry.component === 'TagBadgeList' ? entry.tags.map((tag) => tag.slug) : [],
          )
        : [],
    );
    expect(storyIds.length).toBeGreaterThan(0);
    expect(tagSlugs.length).toBeGreaterThan(0);

    const hrefs = (selector: string) =>
      [...container.querySelectorAll(selector)].map((link) => link.getAttribute('href'));
    expect(hrefs('article[data-story-id] h3 a[href^="/story/"]')).toEqual(
      storyIds.map((id) => `/story/${id}`),
    );
    expect(hrefs('section a[href^="/feed?tags="]')).toEqual(
      tagSlugs.map((slug) => `/feed?tags=${slug}`),
    );
  });

  it('moves focus to the cited card when a footnote chip is clicked', async () => {
    await renderCompleteBriefing();
    const chip = [...container.querySelectorAll('ol a')].find(
      (link) => link.textContent === '[1]',
    ) as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => chip.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    const firstCitedId = MESSAGES.flatMap((m) =>
      'updateComponents' in m ? m.updateComponents.components : [],
    ).find((entry) => entry.component === 'KeyTakeaways')?.items[0]?.storyIds[0];
    const card = container.querySelector(`article[data-story-id="${firstCitedId}"]`);
    expect(document.activeElement).toBe(card);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('numbers footnote chips in first-citation order', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    await send(push, MESSAGES[0]);
    await send(push, {
      version: '1.0',
      updateComponents: {
        surfaceId: 'briefing-cbriefq0ts001',
        components: [
          {
            id: 's0_takeaways',
            component: 'KeyTakeaways',
            items: [
              { text: 'First', storyIds: ['storyB', 'storyA'] },
              { text: 'Second', storyIds: ['storyA', 'storyC'] },
            ],
          },
          { id: 'root', component: 'Briefing', title: 'T', children: ['s0_takeaways'] },
        ],
      },
    });
    const labels = [...container.querySelectorAll('ol a')].map((b) => b.textContent);
    expect(labels).toEqual(['[1]', '[2]', '[2]', '[3]']);
  });

  it('renders the consensus verdict as an icon and text', async () => {
    await renderCompleteBriefing();
    const verdict = [...container.querySelectorAll('[data-slot="badge"]')].find(
      (badge) => badge.textContent === 'Mixed',
    );
    expect(verdict?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('View as table works for the chart inside a briefing', async () => {
    await renderCompleteBriefing();
    expect(container.querySelector('table')).toBeNull();
    const toggle = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'View as table',
    ) as HTMLButtonElement;
    await act(async () => toggle.click());
    expect(container.querySelector('table')?.textContent).toContain('Nov');
  });

  it('shows model text as text, never as HTML', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    const [create] = MESSAGES;
    await send(push, create);
    await send(push, {
      version: '1.0',
      updateComponents: {
        surfaceId: 'briefing-cbriefq0ts001',
        components: [
          {
            id: 'root',
            component: 'Briefing',
            title: '<img src=x onerror=alert(1)>',
            children: [],
          },
        ],
      },
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('header h2')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('ignores an invalid message and an unknown component without throwing', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    const [create, rootUpdate] = MESSAGES;
    await send(push, create);
    await send(push, { version: '1.0', unknownEnvelope: {} });
    await send(push, 'not a message');
    await send(push, {
      version: '1.0',
      updateComponents: {
        surfaceId: 'briefing-cbriefq0ts001',
        components: [{ id: 'x', component: 'Carousel', children: [] }],
      },
    });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await send(push, rootUpdate);
    expect(container.querySelector('header h2')).not.toBeNull();
  });

  it('unmounting disposes the processor and leaves no subscription on the source', async () => {
    const dispose = vi.spyOn(MessageProcessor.prototype, 'dispose');
    const { source, listeners } = manualSource();
    await renderView(source);
    expect(listeners.size).toBe(1);
    await act(async () => root.render(<div />));
    expect(listeners.size).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('a data-model value that is not a string renders nothing instead of crashing the view', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    await send(push, MESSAGES[0]);
    await send(push, MESSAGES[1]);
    await send(push, {
      version: '1.0',
      updateDataModel: { surfaceId: SURFACE_ID, path: '/meta/subtitle', value: { evil: 1 } },
    });
    expect(container.querySelector('header h2')?.textContent).toBe(
      "TypeScript tooling: this week's debates",
    );
    expect(container.querySelector('header p')).toBeNull();
    expect(container.textContent).not.toContain("couldn't be displayed");
  });

  it('a title bound to an object renders no title and no crash, and the sections still show', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    await send(push, {
      version: '1.0',
      createSurface: {
        surfaceId: SURFACE_ID,
        catalogId: DEVBRIEF_CATALOG_ID,
        dataModel: { meta: { title: { evil: 1 } } },
      },
    });
    await send(push, {
      version: '1.0',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 's0_tags', component: 'TagBadgeList', tags: [{ slug: 'rust', label: 'Rust' }] },
          {
            id: 'root',
            component: 'Briefing',
            title: { '@path': '/meta/title' },
            children: ['s0_tags'],
          },
        ],
      },
    });
    expect(container.querySelector('header h2')).toBeNull();
    expect(container.querySelector('a[href="/feed?tags=rust"]')).not.toBeNull();
  });

  it('shows a calm line when a section throws while rendering', async () => {
    chart.throws = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderCompleteBriefing();
    await act(async () => {});
    expect(container.textContent).toContain("This briefing couldn't be displayed");
    expect(container.querySelector('[data-briefing]')).toBeNull();
  });

  it('showing a new source drops the old briefing and waits for the new one root', async () => {
    const first = manualSource();
    await renderView(first.source);
    for (const message of MESSAGES) await send(first.push, message);
    expect(container.querySelector('header h2')).not.toBeNull();

    const second = manualSource();
    await renderView(second.source);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('[data-briefing]')).toBeNull();

    await send(second.push, {
      version: '1.0',
      createSurface: { surfaceId: 'briefing-cother0000001', catalogId: DEVBRIEF_CATALOG_ID },
    });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await send(second.push, {
      version: '1.0',
      updateComponents: {
        surfaceId: 'briefing-cother0000001',
        components: [{ id: 'root', component: 'Briefing', title: 'Other briefing', children: [] }],
      },
    });
    expect(container.querySelector('header h2')?.textContent).toBe('Other briefing');
  });

  it('deleting a surface that is not the shown one keeps the briefing', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    for (const message of MESSAGES) await send(push, message);
    await send(push, { version: '1.0', deleteSurface: { surfaceId: 'briefing-cother0000001' } });
    expect(container.querySelector('header h2')).not.toBeNull();
    await send(push, { version: '1.0', deleteSurface: { surfaceId: SURFACE_ID } });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('a chip whose card is not in the briefing links to /story/<id> and is not intercepted', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    await send(push, MESSAGES[0]);
    await send(push, {
      version: '1.0',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          {
            id: 's0_takeaways',
            component: 'KeyTakeaways',
            title: 'Key takeaways',
            items: [{ text: 'Uncited card', storyIds: ['a/b c'] }],
          },
          { id: 'root', component: 'Briefing', title: 'T', children: ['s0_takeaways'] },
        ],
      },
    });
    const chip = container.querySelector('ol a') as HTMLAnchorElement;
    expect(chip.getAttribute('href')).toBe('/story/a%2Fb%20c');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => chip.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(false);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('colours each verdict by its own role token, keeping the icon and text', async () => {
    const tones = { mostly_positive: 'success', mixed: 'warning', mostly_negative: 'destructive' };
    for (const [verdict, role] of Object.entries(tones)) {
      const { source, push } = manualSource();
      await renderView(source);
      await send(push, MESSAGES[0]);
      await send(push, {
        version: '1.0',
        updateComponents: {
          surfaceId: SURFACE_ID,
          components: [
            {
              id: 's0_c',
              component: 'ConsensusCallout',
              topic: 'Topic',
              verdict,
              pros: [{ point: 'A', storyIds: [] }],
              cons: [{ point: 'B', storyIds: [] }],
            },
            { id: 'root', component: 'Briefing', title: 'T', children: ['s0_c'] },
          ],
        },
      });
      const badge = container.querySelector('h3 + [data-slot="badge"]');
      expect(badge?.className).toContain(`border-${role}`);
      expect(badge?.className).toContain(`bg-${role}/15`);
      expect(badge?.querySelector('svg')).not.toBeNull();
      expect(badge?.textContent).not.toBe('');
      await act(async () => root.render(<div />));
    }
  });

  it('repeated takeaways, chips, bullets and tags raise no React key warning', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const { source, push } = manualSource();
    await renderView(source);
    await send(push, MESSAGES[0]);
    await send(push, {
      version: '1.0',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          {
            id: 's0_takeaways',
            component: 'KeyTakeaways',
            title: 'Key takeaways',
            items: [
              { text: 'Same', storyIds: ['storyA', 'storyA'] },
              { text: 'Same', storyIds: ['storyA'] },
            ],
          },
          {
            id: 's1_c',
            component: 'ConsensusCallout',
            topic: 'Topic',
            verdict: 'mixed',
            pros: [
              { point: 'Twice', storyIds: [] },
              { point: 'Twice', storyIds: [] },
            ],
            cons: [],
          },
          {
            id: 's2_tags',
            component: 'TagBadgeList',
            tags: [
              { slug: 'rust', label: 'Rust' },
              { slug: 'rust', label: 'Rust' },
            ],
          },
          {
            id: 'root',
            component: 'Briefing',
            title: 'T',
            children: ['s0_takeaways', 's1_c', 's2_tags'],
          },
        ],
      },
    });
    expect(container.querySelectorAll('ol a')).toHaveLength(3);
    expect(container.querySelectorAll('h4 + ul li')).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows a tag delta as arrow and rounded text, and no arrow when it rounds to zero', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    await send(push, MESSAGES[0]);
    await send(push, {
      version: '1.0',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          {
            id: 's0_tags',
            component: 'TagBadgeList',
            tags: [
              { slug: 'rust', label: 'Rust', deltaPct: 12 },
              { slug: 'go', label: 'Go', deltaPct: -0.3 },
            ],
          },
          { id: 'root', component: 'Briefing', title: 'T', children: ['s0_tags'] },
        ],
      },
    });
    const [rise, flat] = [...container.querySelectorAll('li')];
    expect(rise?.textContent).toContain('▲');
    expect(rise?.textContent).toContain('+12%');
    expect(flat?.textContent).toContain('0%');
    expect(flat?.textContent).not.toMatch(/[▲▼]/);
  });

  it('the briefing title is an h2, with card and section titles one level below', async () => {
    await renderCompleteBriefing();
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('header h2')).not.toBeNull();
    expect(container.querySelector('article h3')).not.toBeNull();
    expect(container.querySelector('h3 + [data-slot="badge"]')).not.toBeNull();
    expect(container.querySelector('h4')).not.toBeNull();
  });

  it('keeps the title sticky at a CSS variable that defaults to the app header height', async () => {
    await renderCompleteBriefing();
    expect(container.querySelector('header')?.className).toContain(
      'top-[var(--briefing-sticky-top,3.5rem)]',
    );
  });
});
