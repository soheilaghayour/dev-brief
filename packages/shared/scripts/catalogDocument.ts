import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  DEVBRIEF_CATALOG_ID,
  DevBriefComponents,
  type DevBriefComponentName,
} from '../src/a2ui/catalog.js';

// "Surface" is the A2UI v1.0 name for the parent of a surface's root component.
const ALLOWED_PARENTS = {
  Briefing: ['Surface'],
  KeyTakeaways: ['Briefing'],
  StoryClusterCard: ['Briefing'],
  ConsensusCallout: ['Briefing'],
  TechVelocityChart: ['Briefing'],
  TagBadgeList: ['Briefing'],
} satisfies Record<DevBriefComponentName, string[]>;

function componentDefinition(name: DevBriefComponentName) {
  const schema = DevBriefComponents[name].extend({ component: z.literal(name) });
  const definition: Record<string, unknown> = zodToJsonSchema(schema, {
    target: 'jsonSchema2019-09',
    $refStrategy: 'none',
    // Zod strips unknown keys rather than rejecting them, and every wire entry also carries `id`.
    removeAdditionalStrategy: 'strict',
  });
  // The document declares the draft once, at its top.
  delete definition.$schema;
  return { ...definition, allowedParents: ALLOWED_PARENTS[name] };
}

/** The A2UI v1.0 catalog document of the DevBrief catalog, generated from its Zod schemas. */
export function buildCatalogDocument() {
  const names = Object.keys(DevBriefComponents) as DevBriefComponentName[];
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: DEVBRIEF_CATALOG_ID,
    catalogId: DEVBRIEF_CATALOG_ID,
    protocolVersion: '1.0',
    title: 'DevBrief catalog',
    description: 'Briefing components for the DevBrief copilot.',
    components: Object.fromEntries(names.map((name) => [name, componentDefinition(name)])),
  };
}
