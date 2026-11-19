import { describe, expect, it } from 'vitest';
import { MergeRequestSchema } from './saves.js';
import { StoryLookupRequestSchema } from './story.js';

const cuid = 'cm0abcdefghijklmnopqrstuv';

describe('story id validation', () => {
  it('accepts cuids and rejects other strings in lookup ids', () => {
    expect(StoryLookupRequestSchema.safeParse({ ids: [cuid] }).success).toBe(true);
    expect(StoryLookupRequestSchema.safeParse({ ids: ['x'.repeat(900)] }).success).toBe(false);
    expect(StoryLookupRequestSchema.safeParse({ ids: ['a'] }).success).toBe(false);
  });

  it('rejects a merge save with a malformed story id', () => {
    const savedAt = '2026-01-01T00:00:00.000Z';
    expect(
      MergeRequestSchema.safeParse({ version: 1, saves: [{ storyId: cuid, savedAt }] }).success,
    ).toBe(true);
    expect(
      MergeRequestSchema.safeParse({ version: 1, saves: [{ storyId: 'nope', savedAt }] }).success,
    ).toBe(false);
  });
});
