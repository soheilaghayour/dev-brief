import { z } from 'zod';

export const MeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  providers: z.array(z.enum(['github', 'google'])),
  createdAt: z.string().datetime(),
});
export type Me = z.infer<typeof MeSchema>;
