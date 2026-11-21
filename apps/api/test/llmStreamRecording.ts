import type { StreamPart } from './mockLanguageModel.js';

/** A recorded provider stream: the parts a mock model replays through `doStream`. */
export type LlmStreamRecording = {
  /** True until the owner records the real stream with `recordLlmFixtures.ts`. */
  placeholder?: boolean;
  recordedAt: string;
  model: string;
  promptVersion: number;
  parts: StreamPart[];
};
