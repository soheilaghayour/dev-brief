import { z } from 'zod';
import { FEED_LIST_MAX } from './feedLimits.js';
import { SourceSlugSchema } from './sources.js';
import { TagSlugSchema } from './story.js';

// Capped like the feed params they become, so a valid set always gives a valid feed URL.
const PreferenceListsSchema = z.object({
  tags: z.array(TagSlugSchema).max(FEED_LIST_MAX),
  sources: z.array(SourceSlugSchema).max(FEED_LIST_MAX),
});

export const PreferencesSchema = z
  .object({ follow: PreferenceListsSchema, mute: PreferenceListsSchema })
  .superRefine(({ follow, mute }, context) => {
    for (const list of ['tags', 'sources'] as const) {
      const followed = new Set<string>(follow[list]);
      mute[list].forEach((value, index) => {
        if (!followed.has(value)) return;
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mute', list, index],
          message: `"${value}" is both followed and muted`,
        });
      });
    }
  });
export type Preferences = z.infer<typeof PreferencesSchema>;
