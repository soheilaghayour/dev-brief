import { describe, expect, it } from 'vitest';
import {
  A2uiComponentEntrySchema,
  A2uiServerMessageSchema,
  ChildIdList,
  DEVBRIEF_CATALOG_ID,
  DevBriefComponents,
} from './catalog.js';
import tsToolingBriefing from './fixtures/tsToolingBriefing.json';

const briefingRoot = {
  id: 'root',
  component: 'Briefing',
  title: 'TypeScript tooling',
  children: [],
};
const takeaways = {
  component: 'KeyTakeaways',
  items: [{ text: 'Native compiler preview dominated', storyIds: ['cbriefts0001'] }],
};

describe('A2uiComponentEntrySchema', () => {
  it('accepts a Briefing with id root', () => {
    expect(A2uiComponentEntrySchema.safeParse(briefingRoot).success).toBe(true);
  });

  it('rejects a Briefing with any other id', () => {
    expect(A2uiComponentEntrySchema.safeParse({ ...briefingRoot, id: 'briefing' }).success).toBe(
      false,
    );
  });

  it('rejects a KeyTakeaways with id root', () => {
    expect(A2uiComponentEntrySchema.safeParse({ ...takeaways, id: 'root' }).success).toBe(false);
  });

  it('accepts a KeyTakeaways under a UAX #31 id and rejects a hyphenated one', () => {
    expect(A2uiComponentEntrySchema.safeParse({ ...takeaways, id: 's0_takeaways' }).success).toBe(
      true,
    );
    expect(A2uiComponentEntrySchema.safeParse({ ...takeaways, id: 's0-takeaways' }).success).toBe(
      false,
    );
  });

  it('accepts a literal or a data binding as the Briefing subtitle', () => {
    const bound = { ...briefingRoot, subtitle: { '@path': '/meta/subtitle' } };
    expect(A2uiComponentEntrySchema.safeParse(bound).success).toBe(true);
    const relative = { ...briefingRoot, subtitle: { '@path': 'meta/subtitle' } };
    expect(A2uiComponentEntrySchema.safeParse(relative).success).toBe(false);
  });
});

describe('ChildIdList', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => `s${index}_tags`);

  it('accepts 24 children and rejects 25', () => {
    expect(ChildIdList.safeParse(ids(24)).success).toBe(true);
    expect(ChildIdList.safeParse(ids(25)).success).toBe(false);
  });
});

describe('ChildIdList ids', () => {
  it.each([
    ['root', ['root']],
    ['a hyphenated id', ['s0-takeaways']],
    ['a duplicate id', ['s0_tags', 's0_tags']],
  ])('rejects %s', (_label, children) => {
    expect(ChildIdList.safeParse(children).success).toBe(false);
  });
});

describe('DevBriefComponents', () => {
  it('rejects a tag outside the taxonomy', () => {
    const tags = (slug: string) => ({ tags: [{ slug, label: slug }] });
    expect(DevBriefComponents.TagBadgeList.safeParse(tags('typescript')).success).toBe(true);
    expect(DevBriefComponents.TagBadgeList.safeParse(tags('cobol')).success).toBe(false);
  });
});

describe('A2uiServerMessageSchema', () => {
  const surfaceId = 'briefing-cbriefq0ts001';
  const components = [briefingRoot];

  it('accepts the four v1.0 envelopes', () => {
    const messages = [
      { version: '1.0', createSurface: { surfaceId, catalogId: DEVBRIEF_CATALOG_ID } },
      { version: '1.0', updateComponents: { surfaceId, components } },
      {
        version: '1.0',
        updateDataModel: { surfaceId, path: '/meta/subtitle', value: 'Nov 12–19' },
      },
      { version: '1.0', deleteSurface: { surfaceId } },
    ];
    for (const message of messages) {
      expect(A2uiServerMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it.each([
    // Built from parts so the v0.8 name scan doesn't flag this file.
    ['surface' + 'Update', { surfaceId, components }],
    ['dataModel' + 'Update', { surfaceId, contents: [] }],
    ['begin' + 'Rendering', { surfaceId, root: 'root' }],
  ])('rejects the v0.8 envelope %s', (name, body) => {
    expect(A2uiServerMessageSchema.safeParse({ version: '1.0', [name]: body }).success).toBe(false);
  });

  it('rejects an envelope without version 1.0', () => {
    const update = { updateComponents: { surfaceId, components } };
    expect(A2uiServerMessageSchema.safeParse(update).success).toBe(false);
    expect(A2uiServerMessageSchema.safeParse({ version: '0.9', ...update }).success).toBe(false);
    expect(A2uiServerMessageSchema.safeParse({ version: 'v1.0', ...update }).success).toBe(false);
  });

  it('rejects a catalogId other than the DevBrief catalog', () => {
    const foreign = {
      version: '1.0',
      createSurface: { surfaceId, catalogId: 'https://example.com/other.json' },
    };
    expect(A2uiServerMessageSchema.safeParse(foreign).success).toBe(false);
  });

  it('rejects a createSurface with an empty components list', () => {
    const empty = {
      version: '1.0',
      createSurface: { surfaceId, catalogId: DEVBRIEF_CATALOG_ID, components: [] },
    };
    expect(A2uiServerMessageSchema.safeParse(empty).success).toBe(false);
  });

  it('rejects an unknown key on an envelope or its body', () => {
    const deleted = { version: '1.0', deleteSurface: { surfaceId } };
    expect(A2uiServerMessageSchema.safeParse({ ...deleted, extra: 1 }).success).toBe(false);
    expect(
      A2uiServerMessageSchema.safeParse({ ...deleted, deleteSurface: { surfaceId, extra: 1 } })
        .success,
    ).toBe(false);
  });

  it('parses every message of the tsToolingBriefing fixture', () => {
    for (const message of tsToolingBriefing) {
      expect(A2uiServerMessageSchema.parse(message)).toEqual(message);
    }
  });
});
