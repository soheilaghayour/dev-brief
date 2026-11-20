import { z } from 'zod';
import { FEED_LIST_MAX, FEED_SOURCE_SLUG_MAX } from './feedLimits.js';
import { TagSlugSchema } from './story.js';

/** A source slug by format only, so a source removed later never invalidates a stored set. */
export const SourceSlugSchema = z
  .string()
  .max(FEED_SOURCE_SLUG_MAX)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'A source slug is lowercase words joined by hyphens');

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
