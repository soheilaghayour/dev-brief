// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  A2uiServerMessageSchema,
  EXAMPLE_QUESTIONS,
  QUESTION_MAX_CHARS,
  type CopilotQuota,
} from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import { ApiError } from '@/lib/api/apiError';
import { CopilotCommandBar } from './CopilotCommandBar';
import { formatResetTime, SPEND_CAP_BANNER } from './copilotMessages';
import type { StreamEvent } from './streamBriefing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEVICE_ID = '0b9f8a4e-5a56-4c1d-9c51-3b0f2f6d9c11';
const QUOTA: CopilotQuota = { limit: 3, remaining: 2, resetsAt: '2026-11-22T00:00:00.000Z' };
const MESSAGES = A2uiServerMessageSchema.array().parse(tsToolingBriefing);

const mocks = vi.hoisted(() => ({
  streamBriefing: vi.fn(),
  getCopilotQuota: vi.fn(),
  user: null as { id: string } | null,
}));

vi.mock('./streamBriefing', () => ({ streamBriefing: mocks.streamBriefing }));
vi.mock('@/lib/api/endpoints', () => ({ getCopilotQuota: mocks.getCopilotQuota }));
vi.mock('@/lib/guest/loadDeviceId', () => ({ loadDeviceId: async () => DEVICE_ID }));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: mocks.user }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
// Recharts needs real layout; the briefing's chart is not under test here.
vi.mock('@/components/radar/VelocityLines', () => ({ default: () => <div /> }));

const metaEvent = (extra: { fallback?: 'SPEND_CAP' | 'NO_COVERAGE'; remaining?: number } = {}) =>
  ({
    type: 'meta',
    data: {
      queryId: 'q1',
      cached: false,
      ...(extra.fallback && { fallback: extra.fallback }),
      quota: { ...QUOTA, remaining: extra.remaining ?? 2 },
    },
  }) satisfies StreamEvent;
const a2uiEvents = (count: number): StreamEvent[] =>
  MESSAGES.slice(0, count).map((message) => ({ type: 'a2ui', message }));
const doneEvent = { type: 'done', data: {} } satisfies StreamEvent;

/** A scripted stream: the events, then how it ends. A `hang` waits until the request is aborted, like a live one. */
function scriptStream(events: StreamEvent[], ending: 'end' | 'hang' | Error = 'end') {
  mocks.streamBriefing.mockImplementationOnce(async function* (
    _request: unknown,
    { signal }: { signal: AbortSignal },
  ) {
    for (const event of events) yield event;
    if (ending instanceof Error) throw ending;
    if (ending === 'hang') {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      throw new DOMException('Aborted', 'AbortError');
    }
  });
}

let container: HTMLDivElement;
let root: Root;
const onOpenChange = vi.fn();

beforeEach(() => {
  mocks.user = null;
  mocks.streamBriefing.mockReset();
  mocks.getCopilotQuota.mockReset().mockResolvedValue(QUOTA);
  onOpenChange.mockReset();
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  // jsdom has no layout, so scrolling is a no-op to observe.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function openBar(open = true) {
  await act(async () =>
    root.render(
      <CopilotCommandBar
        open={open}
        onOpenChange={onOpenChange}
        opener={null}
        fallbackFocus={() => null}
      />,
    ),
  );
}

const input = () => document.querySelector<HTMLInputElement>('input[aria-label="Your question"]')!;
const buttonNamed = (name: string | RegExp) =>
  [...document.querySelectorAll('button')].find((button) =>
    typeof name === 'string'
      ? button.textContent?.trim() === name
      : name.test(button.textContent ?? ''),
  );

async function typeQuestion(text: string) {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function pressEnter() {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

async function click(element: Element | undefined) {
  await act(async () => (element as HTMLElement).click());
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('CopilotCommandBar', () => {
  it('AC-3.1.1 shows the three suggested questions and an input limited to 200 characters', async () => {
    await openBar();

    const suggestions = [
      ...document.querySelectorAll('ul[aria-label="Suggested questions"] button'),
    ];
    expect(suggestions.map((button) => button.textContent)).toEqual(
      EXAMPLE_QUESTIONS.map(({ question }) => question),
    );
    expect(input().maxLength).toBe(QUESTION_MAX_CHARS);
    expect(document.body.textContent).toContain('0/200');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Ask the News');
  });

  it('AC-3.1.1 Enter submits the typed question with the device id', async () => {
    scriptStream([metaEvent(), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();

    await typeQuestion('  Is Bun ready for production?  ');
    await pressEnter();

    expect(mocks.streamBriefing).toHaveBeenCalledTimes(1);
    expect(mocks.streamBriefing.mock.calls[0]?.[0]).toEqual({
      question: 'Is Bun ready for production?',
      deviceId: DEVICE_ID,
    });
  });

  it('does not submit a question shorter than the API accepts', async () => {
    await openBar();

    await typeQuestion('hi');
    await pressEnter();

    expect(mocks.streamBriefing).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Ask"]')?.disabled).toBe(
      true,
    );
  });

  it('AC-3.1.1 clicking a suggestion submits it', async () => {
    scriptStream([metaEvent(), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();

    await click(buttonNamed(EXAMPLE_QUESTIONS[0].question));

    expect(mocks.streamBriefing.mock.calls[0]?.[0]).toMatchObject({
      question: EXAMPLE_QUESTIONS[0].question,
    });
    expect(input().value).toBe(EXAMPLE_QUESTIONS[0].question);
  });

  it('AC-3.1.1 Esc closes the bar and aborts the request', async () => {
    scriptStream([metaEvent(), ...a2uiEvents(2)], 'hang');
    await openBar();
    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    const { signal } = mocks.streamBriefing.mock.calls[0]![1] as { signal: AbortSignal };
    expect(signal.aborted).toBe(false);

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await openBar(false);
    expect(signal.aborted).toBe(true);
  });

  it('a new question aborts the one still streaming', async () => {
    scriptStream([metaEvent()], 'hang');
    scriptStream([metaEvent(), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();

    await typeQuestion('First question here');
    await pressEnter();
    const first = mocks.streamBriefing.mock.calls[0]![1] as { signal: AbortSignal };
    await typeQuestion('Second question here');
    await pressEnter();

    expect(first.signal.aborted).toBe(true);
    expect(mocks.streamBriefing).toHaveBeenCalledTimes(2);
  });

  it('AC-3.1.4 the badge shows the remaining count from /copilot/quota', async () => {
    await openBar();

    expect(mocks.getCopilotQuota).toHaveBeenCalledWith(DEVICE_ID, expect.any(AbortSignal));
    expect(document.body.textContent).toContain('2/3 left');
  });

  it('AC-3.1.4 the badge updates from each meta.quota', async () => {
    mocks.getCopilotQuota.mockResolvedValue({ ...QUOTA, remaining: 1 });
    scriptStream([metaEvent({ remaining: 1 }), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();

    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();

    expect(document.body.textContent).toContain('1/3 left');
  });

  it('AC-3.1.4 a 429 shows the reset time in local time, 0 left and the sign-in hint for a guest', async () => {
    mocks.getCopilotQuota
      .mockResolvedValueOnce(QUOTA)
      .mockResolvedValueOnce({ ...QUOTA, remaining: 0 });
    mocks.streamBriefing.mockImplementationOnce(async function* () {
      yield* [] as StreamEvent[];
      throw new ApiError(
        'QUOTA_EXCEEDED',
        'No questions left',
        'r1',
        429,
        undefined,
        QUOTA.resetsAt,
      );
    });
    await openBar();

    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();

    const text = document.body.textContent ?? '';
    expect(text).toContain(
      `No questions left today — resets at ${formatResetTime(QUOTA.resetsAt)}.`,
    );
    expect(text).toContain('0/3 left');
    expect(buttonNamed('Try again')).toBeUndefined();
    const hint = [...document.querySelectorAll('a')].find(
      (a) => a.textContent === 'Sign in for 20 a day',
    );
    expect(hint?.getAttribute('href')).toBe('/sign-in');
  });

  it('AC-3.1.4 a signed-in user gets no sign-in hint on a 429', async () => {
    mocks.user = { id: 'u1' };
    mocks.streamBriefing.mockImplementationOnce(async function* () {
      yield* [] as StreamEvent[];
      throw new ApiError(
        'QUOTA_EXCEEDED',
        'No questions left',
        'r1',
        429,
        undefined,
        QUOTA.resetsAt,
      );
    });
    await openBar();

    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();

    expect(document.body.textContent).toContain('No questions left today');
    expect(document.body.textContent).not.toContain('Sign in for 20 a day');
  });

  it('AC-3.1.5 a spend-cap fallback puts the exact banner above the example briefing', async () => {
    scriptStream([metaEvent({ fallback: 'SPEND_CAP' }), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();

    await click(buttonNamed(EXAMPLE_QUESTIONS[0].question));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("TypeScript tooling: this week's debates"),
    );

    const banner = [...document.querySelectorAll('p')].find(
      (p) => p.textContent === SPEND_CAP_BANNER,
    );
    expect(banner).toBeDefined();
    expect(SPEND_CAP_BANNER).toBe(
      "Live answers are paused for today — here's an example briefing.",
    );
    const heading = [...document.querySelectorAll('h1, h2, h3')].find((h) =>
      h.textContent?.includes('TypeScript tooling'),
    )!;
    expect(
      banner!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows no extra copy for a no-coverage answer', async () => {
    scriptStream([metaEvent({ fallback: 'NO_COVERAGE' }), ...a2uiEvents(2), doneEvent]);
    await openBar();

    await typeQuestion('COBOL on the blockchain');
    await pressEnter();
    await flush();

    expect(document.body.textContent).not.toContain(SPEND_CAP_BANNER);
    expect(document.body.textContent).not.toContain("Couldn't");
  });

  it('AC-3.1.8 after one section then an error event the section stays and Try again re-asks', async () => {
    // createSurface, root, subtitle and the takeaways section, then the failure.
    scriptStream([
      metaEvent(),
      ...a2uiEvents(4),
      {
        type: 'error',
        data: { code: 'GENERATION_FAILED', message: 'The briefing could not be generated.' },
      },
    ]);
    scriptStream([metaEvent(), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();

    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Key takeaways'));

    expect(document.body.textContent).toContain("Couldn't finish this briefing.");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't finish this briefing.",
    );

    await click(buttonNamed('Try again'));

    expect(mocks.streamBriefing).toHaveBeenCalledTimes(2);
    expect(mocks.streamBriefing.mock.calls[1]?.[0]).toMatchObject({
      question: 'Is Bun ready for production?',
    });
    await flush();
    expect(document.body.textContent).not.toContain("Couldn't finish this briefing.");
  });

  it('shows an inline message and Try again when the request fails before the stream', async () => {
    mocks.streamBriefing.mockImplementationOnce(async function* () {
      yield* [] as StreamEvent[];
      throw new ApiError('RATE_LIMITED', 'Slow down', 'r1', 429, undefined);
    });
    scriptStream([metaEvent(), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();

    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();

    expect(document.body.textContent).toContain('Too many questions in a short time');
    await click(buttonNamed('Try again'));
    expect(mocks.streamBriefing).toHaveBeenCalledTimes(2);
  });

  it('shows the generic message for a lost connection', async () => {
    mocks.streamBriefing.mockImplementationOnce(async function* () {
      yield* [] as StreamEvent[];
      throw new TypeError('fetch failed');
    });
    await openBar();

    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();

    expect(document.body.textContent).toContain("Couldn't get an answer");
  });

  it('AC-3.1.4 reads the quota again once an answer ends, so the badge shows a refund', async () => {
    mocks.getCopilotQuota
      .mockResolvedValueOnce(QUOTA)
      .mockResolvedValueOnce({ ...QUOTA, remaining: 3 });
    scriptStream([metaEvent({ remaining: 1 })]);
    await openBar();

    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();

    expect(mocks.getCopilotQuota).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('3/3 left');
  });

  it.each([
    ['VALIDATION_FAILED', 400, 'Try rewording it'],
    ['SPEND_CAP_REACHED', 503, 'Live answers are paused for today. Come back tomorrow.'],
  ] as const)('%s gets its own message and no Try again', async (code, status, copy) => {
    mocks.streamBriefing.mockImplementationOnce(async function* () {
      yield* [] as StreamEvent[];
      throw new ApiError(code, 'No', 'r1', status, undefined);
    });
    await openBar();

    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();

    expect(document.body.textContent).toContain(copy);
    expect(buttonNamed('Try again')).toBeUndefined();
  });

  it('keeps its live region in the page while nothing is announced in it', async () => {
    await openBar();

    const region = document.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region?.className).not.toContain('empty:hidden');
  });

  it('a story link closes the bar when followed, but not when ctrl-clicked into a new tab', async () => {
    scriptStream([metaEvent(), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();
    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();
    await vi.waitFor(() =>
      expect(document.querySelector('article a[href^="/story/"]')).not.toBeNull(),
    );
    // jsdom cannot navigate; stopping the default keeps it from logging that.
    const stopNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', stopNavigation);
    const link = document.querySelector<HTMLAnchorElement>('article a[href^="/story/"]')!;

    await act(async () => {
      link.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
      );
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    await click(link);
    document.removeEventListener('click', stopNavigation);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('announces progress in a live region while the answer streams and when it is ready', async () => {
    scriptStream([metaEvent(), ...a2uiEvents(2)], 'hang');
    await openBar();
    await typeQuestion('Is Bun ready for production?');
    await pressEnter();

    const status = () =>
      [...document.querySelectorAll('[role="status"]')]
        .map((element) => element.textContent)
        .join('|');
    expect(status()).toContain('Generating your briefing…');
  });

  it('announces when the briefing is ready', async () => {
    scriptStream([metaEvent(), ...a2uiEvents(MESSAGES.length), doneEvent]);
    await openBar();
    await typeQuestion('Is Bun ready for production?');
    await pressEnter();
    await flush();

    expect(document.body.textContent).toContain('Your briefing is ready.');
  });

  it('sets the briefing title to stick at the top of the results, not under the app header', async () => {
    await openBar();

    const results = document.querySelector<HTMLElement>('[style*="--briefing-sticky-top"]');
    expect(results?.style.getPropertyValue('--briefing-sticky-top')).toBe('0px');
  });
});
