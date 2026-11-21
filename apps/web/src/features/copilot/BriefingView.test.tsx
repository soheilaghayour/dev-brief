// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageProcessor } from '@a2ui/web_core/v1_0';
import { A2uiServerMessageSchema, type A2uiServerMessage } from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import BriefingView, { type BriefingSource } from './BriefingView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Recharts needs real layout; the stub shows that the lazy module arrived.
vi.mock('@/components/radar/VelocityLines', () => ({
  default: () => <div data-testid="lines" />,
}));

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

// What each component renders that no other one does.
const SECTION_SIGNATURES = {
  KeyTakeaways: 'ol',
  StoryClusterCard: 'article[data-story-id]',
  ConsensusCallout: 'p > [data-slot="badge"] > svg',
  TechVelocityChart: 'figure',
  TagBadgeList: 'a[href^="/feed?tags="]',
} as const;

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
        expect(container.querySelector('h1')?.textContent).toBe(
          "TypeScript tooling: this week's debates",
        );
        // Components land in the order of root.children, and an arrived section is not empty.
        expect(renderedSections().map(sectionKind)).toEqual(expectedSectionKinds(seen));
      }
    }
    expect(container.querySelector('h1')?.nextElementSibling?.textContent).toContain(
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
    const chip = [...container.querySelectorAll('ol button')].find(
      (button) => button.textContent === '[1]',
    ) as HTMLButtonElement;
    await act(async () => chip.click());
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
    const labels = [...container.querySelectorAll('ol button')].map((b) => b.textContent);
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
    expect(container.querySelector('h1')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('ignores an invalid message and an unknown component without throwing', async () => {
    const { source, push } = manualSource();
    await renderView(source);
    const [create, rootUpdate] = MESSAGES;
    await send(push, create);
    await send(push, { version: '0.8', surfaceUpdate: {} });
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
    expect(container.querySelector('h1')).not.toBeNull();
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
});
