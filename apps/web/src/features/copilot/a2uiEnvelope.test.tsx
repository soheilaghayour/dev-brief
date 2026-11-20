// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  A2uiSurface,
  createComponentImplementation,
  type ReactCatalogComponent,
} from '@a2ui/react';
import { Catalog, CommonSchemas, MessageProcessor } from '@a2ui/web_core/v1_0';
import {
  A2uiServerMessageSchema,
  DEVBRIEF_CATALOG_ID,
  DevBriefComponents,
  type DevBriefComponentName,
} from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The renderer's own binding and child-list types, so the processor resolves the subtitle and walks the tree.
const BriefingApi = {
  name: 'Briefing',
  schema: DevBriefComponents.Briefing.extend({
    title: CommonSchemas.DynamicString,
    subtitle: CommonSchemas.DynamicString.optional(),
    children: CommonSchemas.ChildList,
  }),
};

const StubBriefing = createComponentImplementation(BriefingApi, ({ props, buildChild }) => (
  <section>
    Briefing: {props.subtitle}
    {props.children.map((child) => {
      const { id, basePath } = typeof child === 'string' ? { id: child, basePath: '/' } : child;
      return <div key={id}>{buildChild(id, basePath)}</div>;
    })}
  </section>
));

const leafNames = Object.keys(DevBriefComponents).filter(
  (name): name is Exclude<DevBriefComponentName, 'Briefing'> => name !== 'Briefing',
);
const stubLeaves = leafNames.map((name) =>
  createComponentImplementation({ name, schema: DevBriefComponents[name] }, () => <p>{name}</p>),
);

const stubCatalog = new Catalog(DEVBRIEF_CATALOG_ID, '1.0', [StubBriefing, ...stubLeaves]);

let container: HTMLDivElement | undefined;
afterEach(() => container?.remove());

describe('the pinned A2UI renderer', () => {
  it('processes the shared tsToolingBriefing fixture and renders every component', async () => {
    const messages = A2uiServerMessageSchema.array().parse(tsToolingBriefing);
    const processor = new MessageProcessor<ReactCatalogComponent>([stubCatalog]);
    processor.processMessages(messages);

    const surface = [...processor.model.surfacesMap.values()][0];
    expect(surface?.id).toBe('briefing-cbriefq0ts001');

    container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    await act(async () => root.render(<A2uiSurface surface={surface!} />));

    expect(container.textContent).toBe(
      'Briefing: Based on 14 stories · Nov 12–19 · HN, Dev.to, 3 blogs' +
        'KeyTakeawaysStoryClusterCardConsensusCalloutTechVelocityChartTagBadgeList',
    );
    act(() => root.unmount());
  });
});
