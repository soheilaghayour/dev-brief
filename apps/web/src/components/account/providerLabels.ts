import type { Me } from '@devbrief/shared';

export const PROVIDER_LABELS = { github: 'GitHub', google: 'Google' } as const satisfies Record<
  Me['providers'][number],
  string
>;
