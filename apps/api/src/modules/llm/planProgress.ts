import { z } from 'zod';

const PartialPlanSchema = z.object({
  title: z.string().optional(),
  sections: z.array(z.unknown()).optional(),
});

/** What a partial plan has finished writing: the title once a later key follows it, then the sections but the last, which `final` releases too. */
export function planProgress(partial: unknown, final: boolean) {
  const plan = PartialPlanSchema.safeParse(partial);
  if (!plan.success) return { title: undefined, sections: [] };
  // Zod returns keys in schema order, so the stream's order is read from the raw object.
  const keys = Object.keys(partial as object);
  const titleComplete = final || (keys.includes('title') && keys.at(-1) !== 'title');
  const { title, sections = [] } = plan.data;
  if (!titleComplete) return { title: undefined, sections: [] };
  return { title, sections: final ? sections : sections.slice(0, -1) };
}
