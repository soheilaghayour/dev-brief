import { describe, expect, it } from 'vitest';
import tsToolingBriefing from '../a2ui/fixtures/tsToolingBriefing.json';
import {
  CopilotAskRequestSchema,
  CopilotMetaEventSchema,
  ExampleBriefingListSchema,
} from './copilot.js';

const deviceId = '5f1c7f4e-8a3b-4c2d-9e6f-0a1b2c3d4e5f';

describe('CopilotAskRequestSchema', () => {
  it('trims the question before checking its length', () => {
    const request = { question: '  Rust vs Go?  ', deviceId };
    expect(CopilotAskRequestSchema.parse(request).question).toBe('Rust vs Go?');
    expect(CopilotAskRequestSchema.safeParse({ question: '  ok   ', deviceId }).success).toBe(
      false,
    );
  });

  it('accepts 200 characters and rejects 201', () => {
    expect(CopilotAskRequestSchema.safeParse({ question: 'a'.repeat(200), deviceId }).success).toBe(
      true,
    );
    expect(CopilotAskRequestSchema.safeParse({ question: 'a'.repeat(201), deviceId }).success).toBe(
      false,
    );
  });

  it('requires a uuid device id', () => {
    const question = 'What were the biggest AI tooling launches this week?';
    expect(CopilotAskRequestSchema.safeParse({ question }).success).toBe(false);
    expect(CopilotAskRequestSchema.safeParse({ question, deviceId: 'device-1' }).success).toBe(
      false,
    );
  });
});

describe('CopilotMetaEventSchema', () => {
  const meta = {
    queryId: 'cbriefq0ts001',
    cached: false,
    quota: { limit: 3, remaining: 2, resetsAt: '2026-11-21T00:00:00Z' },
  };

  it('accepts the known fallbacks only', () => {
    expect(CopilotMetaEventSchema.safeParse(meta).success).toBe(true);
    expect(CopilotMetaEventSchema.safeParse({ ...meta, fallback: 'SPEND_CAP' }).success).toBe(true);
    expect(CopilotMetaEventSchema.safeParse({ ...meta, fallback: 'NO_COVERAGE' }).success).toBe(
      true,
    );
    expect(CopilotMetaEventSchema.safeParse({ ...meta, fallback: 'TIMEOUT' }).success).toBe(false);
  });
});

describe('ExampleBriefingListSchema', () => {
  it('accepts the tsToolingBriefing fixture as an example briefing', () => {
    const list = {
      items: [
        {
          slug: 'ts-tooling-debates',
          question: "What were this week's TypeScript tooling debates?",
          messages: tsToolingBriefing,
        },
      ],
    };
    expect(ExampleBriefingListSchema.safeParse(list).success).toBe(true);
  });
});
