// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A2uiSurface, type ReactCatalogComponent } from '@a2ui/react';
import { Catalog, MessageProcessor } from '@a2ui/web_core/v1_0';
import {
  A2uiServerMessageSchema,
  ALLOWED_PARENTS,
  DEVBRIEF_CATALOG_ID,
  DevBriefComponents,
} from '@devbrief/shared';
import catalogDocument from '@devbrief/shared/a2ui/catalog.v1.json';
import noCoverageBriefing from '@devbrief/shared/a2ui/fixtures/noCoverageBriefing.json';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import { devbriefCatalog } from './catalog';
import { SECTION_SIGNATURES } from './sectionSignatures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/radar/VelocityLines', () => ({ default: () => <div /> }));

// Every file in the shared package's fixtures folder is listed here.
const FIXTURES = [
  { file: 'noCoverageBriefing.json', messages: noCoverageBriefing },
  { file: 'tsToolingBriefing.json', messages: tsToolingBriefing },
];

let container: HTMLDivElement;
beforeEach(() => {
  container = document.body.appendChild(document.createElement('div'));
});
afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

describe('the DevBrief web catalog', () => {
  it('implements exactly the components of the shared catalog, with its allowedParents', () => {
    const implemented = [...devbriefCatalog.components.values()];
    expect(implemented.map(({ name }) => name).sort()).toEqual(
      Object.keys(DevBriefComponents).sort(),
    );
    for (const { name, allowedParents } of implemented)
      expect(allowedParents).toEqual(ALLOWED_PARENTS[name as keyof typeof ALLOWED_PARENTS]);
  });

  it('loads the generated catalog document through Catalog.fromJson', () => {
    expect(Catalog.fromJson(catalogDocument).id).toBe(DEVBRIEF_CATALOG_ID);
  });

  it('enforces allowedParents: a Briefing nested under the root is rejected', () => {
    const processor = new MessageProcessor<ReactCatalogComponent>([devbriefCatalog]);
    const errors = processor.processMessagesWithErrors([
      { version: '1.0', createSurface: { surfaceId: 's', catalogId: DEVBRIEF_CATALOG_ID } },
      {
        version: '1.0',
        updateComponents: {
          surfaceId: 's',
          components: [
            { id: 'inner', component: 'Briefing', title: 'Inner', children: [] },
            { id: 'root', component: 'Briefing', title: 'Outer', children: ['inner'] },
          ],
        },
      },
    ]);
    expect(errors).not.toEqual([]);
  });
});

describe.each(FIXTURES)('fixture $file', ({ messages }) => {
  it('processes every message with the real MessageProcessor and renders it', async () => {
    const consoleError = vi.spyOn(console, 'error');
    const processor = new MessageProcessor<ReactCatalogComponent>([devbriefCatalog]);
    for (const message of messages) {
      expect(A2uiServerMessageSchema.safeParse(message).success).toBe(true);
      expect(processor.processMessagesWithErrors(message)).toEqual([]);
    }

    const surface = [...processor.getSurfaces().values()][0]!;
    const root = createRoot(container);
    await act(async () => root.render(<A2uiSurface surface={surface} />));

    expect(container.querySelector('header h2')?.textContent).toBeTruthy();
    // Each component type in the fixture leaves its own mark in the DOM.
    const types = A2uiServerMessageSchema.array()
      .parse(messages)
      .flatMap((message) =>
        'updateComponents' in message
          ? message.updateComponents.components.map(({ component }) => component)
          : [],
      );
    for (const type of new Set(types))
      if (type !== 'Briefing')
        expect(container.querySelector(SECTION_SIGNATURES[type])).not.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    act(() => root.unmount());
    processor.dispose();
  });
});
