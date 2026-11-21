// @vitest-environment jsdom
import { act } from 'react';
import type { StoryCard } from '@devbrief/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  byRole,
  click,
  mount,
  NoopResizeObserver,
  storyId,
} from '@/components/collections/collectionsHarness';
import { useGuestStore } from '@/lib/guest/guestStore';
import { hydrateGuestStore } from '@/lib/guest/hydrateGuestStore';
import { DigestExportMenu } from './DigestExportMenu';

vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: null, isPending: false }) }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/toast/notify', () => ({ notify }));
const flag = vi.hoisted(() => ({ collections: true }));
vi.mock('@/config/features', () => ({
  FEATURES: {},
  isFeatureEnabled: (name: string) => name !== 'collections' || flag.collections,
}));

const STORY = storyId(1);
const CARD = {
  id: STORY,
  title: 'Why [React] wins',
  url: 'https://example.com/react',
  tags: ['react'],
} as StoryCard;

let unmount = () => {};
let blobs: { parts: unknown[]; type: string | undefined }[] = [];
let downloads: { download: string; href: string }[] = [];

beforeAll(async () => {
  await Promise.all([hydrateGuestStore(), import('./DigestExportDialog')]);
});

beforeEach(async () => {
  flag.collections = true;
  notify.mockReset();
  // 2026-11-21 is in week 2026-W47; the story was saved on the 18th.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T12:00:00Z') });
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  await act(async () => {
    useGuestStore.setState({
      collections: [],
      saves: [{ storyId: STORY, savedAt: '2026-11-18T10:00:00.000Z' }],
      notes: { [STORY]: { note: 'Worth a second read', updatedAt: '2026-11-18T10:05:00.000Z' } },
    });
  });
  blobs = [];
  downloads = [];
  vi.stubGlobal(
    'Blob',
    class {
      constructor(parts: unknown[], options?: { type?: string }) {
        blobs.push({ parts, type: options?.type });
      }
    },
  );
  URL.createObjectURL = vi.fn(() => 'blob:digest');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openDialog(ui = <DigestExportMenu stories={[CARD]} />) {
  const mounted = await mount(ui);
  unmount = mounted.unmount;
  await click(byRole('button', 'Export weekly digest'));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
}

describe('DigestExportMenu', () => {
  it('AC-3.4.4 Download .md makes a Markdown Blob named after the week', async () => {
    await openDialog();

    await click(byRole('button', 'Download .md'));

    expect(downloads).toEqual([{ download: 'devbrief-2026-W47.md', href: 'blob:digest' }]);
    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe('text/markdown;charset=utf-8');
    const markdown = String(blobs[0]?.parts[0]);
    expect(markdown).toContain('# DevBrief digest — 2026-W47');
    expect(markdown).toContain('## [Why \\[React\\] wins](https://example.com/react)');
    expect(markdown).toContain('Worth a second read');
  });

  it('AC-3.4.4 a board names its collection in the heading and the file', async () => {
    await openDialog(
      <DigestExportMenu
        stories={[CARD]}
        fixedCollection={{ name: 'Frontend', slug: 'frontend', storyIds: [STORY] }}
      />,
    );

    await click(byRole('button', 'Download .md'));

    expect(downloads[0]?.download).toBe('devbrief-2026-W47-frontend.md');
    expect(String(blobs[0]?.parts[0])).toContain('# DevBrief digest — 2026-W47 · Frontend');
  });

  it('AC-3.4.4 Copy to clipboard writes the Markdown and toasts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await openDialog();

    await click(byRole('button', 'Copy to clipboard'));

    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('Digest copied to the clipboard'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain('Worth a second read');
  });

  it('AC-3.4.4 says so when the browser refuses the clipboard', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await openDialog();

    await click(byRole('button', 'Copy to clipboard'));

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Couldn’t copy. Use Download .md instead.'),
    );
  });

  it('AC-3.4.4 starts on the current week, in UTC', async () => {
    await openDialog();
    const picker = document.querySelector<HTMLElement>('[aria-label^="Week:"]');
    expect(picker?.textContent).toContain('2026-W47 (Nov 16 – Nov 22)');
  });

  it('shows no export with the collections flag off', async () => {
    flag.collections = false;
    const mounted = await mount(<DigestExportMenu stories={[CARD]} />);
    unmount = mounted.unmount;
    expect(byRole('button', 'Export weekly digest')).toBeNull();
  });
});
