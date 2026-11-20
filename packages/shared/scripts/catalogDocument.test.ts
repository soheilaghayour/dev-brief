import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEVBRIEF_CATALOG_ID } from '../src/a2ui/catalog.js';
import { buildCatalogDocument } from './catalogDocument.js';

const committed: unknown = JSON.parse(
  readFileSync(new URL('../src/a2ui/catalog.v1.json', import.meta.url), 'utf8'),
);

describe('catalog.v1.json', () => {
  it('matches the document generated from the Zod schemas (run catalog:generate)', () => {
    expect(committed).toEqual(buildCatalogDocument());
  });

  it('names the catalog id as both $id and catalogId', () => {
    expect(committed).toMatchObject({ $id: DEVBRIEF_CATALOG_ID, catalogId: DEVBRIEF_CATALOG_ID });
  });
});
