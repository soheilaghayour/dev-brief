import { z } from 'zod';

const PartialPlanSchema = z.object({
  title: z.string().optional(),
  sections: z.array(z.unknown()).optional(),
});

/**
 * What a partial plan (title, then sections) has finished writing: the title once the sections key
 * appears, and every section but the last, which the model may still be writing; `final` releases it.
 */
export function planProgress(partial: unknown, final: boolean) {
  const plan = PartialPlanSchema.safeParse(partial);
  if (!plan.success) return { title: undefined, sections: [] };
  const { title, sections } = plan.data;
  return {
    title: sections !== undefined || final ? title : undefined,
    sections: sections === undefined ? [] : final ? sections : sections.slice(0, -1),
  };
}
