// Regenerates src/a2ui/catalog.v1.json from the Zod schemas: pnpm --filter @devbrief/shared catalog:generate
import { writeFileSync } from 'node:fs';
import { buildCatalogDocument } from './catalogDocument.js';

const catalogPath = new URL('../src/a2ui/catalog.v1.json', import.meta.url);
writeFileSync(catalogPath, `${JSON.stringify(buildCatalogDocument(), null, 2)}\n`);
