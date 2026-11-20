import { describe, expect, it } from 'vitest';
import { A2uiServerMessageSchema } from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';

describe('the @devbrief/shared test alias', () => {
  it('resolves a package-exports subpath next to the root entry', () => {
    expect(A2uiServerMessageSchema.array().parse(tsToolingBriefing)).toHaveLength(
      tsToolingBriefing.length,
    );
  });
});
