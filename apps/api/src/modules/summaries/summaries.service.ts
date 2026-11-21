import { Inject, Injectable } from '@nestjs/common';
import type { StorySummary } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { findSummary } from '../../common/story-card/clusterSummary.js';
import { toStorySummary } from '../../common/story-card/storyCard.mapper.js';
import { type LlmFeature, Prisma, type SummaryTrigger } from '../../generated/prisma/client.js';
import { LlmService, type StructuredResult } from '../llm/llm.service.js';
import {
  MAX_OUTPUT_TOKENS,
  PROMPT_VERSION,
  type StorySummaryLlm,
} from '../llm/prompts/storySummary.v2.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import { SummaryInputsService } from './summaryInputs.service.js';
import { summaryRequest } from './summaryRequest.js';
import { storedConsensus } from './summaryRules.js';

/** `cached` when the story already had a summary and no model was called, `created` when this call wrote it, `raced` when a concurrent call stored one while this call's model request ran (its cost is in the ledger). */
export type GenerateResult = { kind: 'cached' | 'created' | 'raced'; summary: StorySummary };

const FEATURE_BY_TRIGGER = {
  auto: 'summary_auto',
  on_demand: 'summary_on_demand',
} as const satisfies Record<SummaryTrigger, LlmFeature>;

/** Reads and generates story summaries; a story or cluster is summarised at most once, and a failed generation stores nothing. */
@Injectable()
export class SummariesService {
  // One generation per cluster at a time within this process; across instances the unique `Summary.storyId` decides.
  private readonly generating = new Map<string, Promise<GenerateResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputs: SummaryInputsService,
    private readonly llm: LlmService,
    @Inject(ENV) private readonly env: Pick<Env, 'FEATURE_CLUSTERS'>,
  ) {}

  /** The story's summary, or its cluster's; throws `NOT_FOUND` when the story is unknown or has no summary yet. */
  async get(storyId: string) {
    const summary = await this.find(storyId);
    if (!summary) throw new ApiException('NOT_FOUND', 'This story has no summary yet.');
    return summary;
  }

  /** Returns the stored summary (the cluster's, for a member), or generates and stores one on the representative; throws `NOT_FOUND`, `SummaryInputsUnavailableError` (also when `signal` aborts the fetches), `SpendCapReachedError` or `GenerationFailedError`. */
  async generate(
    storyId: string,
    trigger: SummaryTrigger,
    { userId, signal }: { userId?: string; signal?: AbortSignal } = {},
  ): Promise<GenerateResult> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, clusterId: true },
    });
    // A cached summary costs no fetch and no LLM call.
    const existing = story && (await this.findFor(story));
    if (existing) return { kind: 'cached', summary: existing };

    const clusterId = this.env.FEATURE_CLUSTERS ? story?.clusterId : null;
    if (!story || !clusterId) return this.generateAndStore(storyId, trigger, { userId, signal });

    const running = this.generating.get(clusterId);
    if (running) {
      // Another member's request is generating the cluster's summary; wait for it instead of paying for a second call.
      const { summary } = await untilAborted(running, signal, storyId);
      return { kind: 'cached', summary };
    }
    const generation = this.generateAsLeader(story, trigger, { userId, signal }).finally(() =>
      this.generating.delete(clusterId),
    );
    this.generating.set(clusterId, generation);
    return generation;
  }

  private async generateAsLeader(
    story: { id: string; clusterId: string | null },
    trigger: SummaryTrigger,
    options: { userId?: string; signal?: AbortSignal },
  ): Promise<GenerateResult> {
    // A previous leader may have stored the summary after this request's first check and left the map before it looked.
    const stored = await this.findFor(story);
    if (stored) return { kind: 'cached', summary: stored };
    return this.generateAndStore(story.id, trigger, options);
  }

  private async generateAndStore(
    storyId: string,
    trigger: SummaryTrigger,
    { userId, signal }: { userId?: string; signal?: AbortSignal },
  ): Promise<GenerateResult> {
    const inputs = await this.inputs.collectSummaryInputs(storyId, { signal });
    const { system, prompt, basedOnComments, schema } = summaryRequest(inputs);
    const result = await this.llm.generateStructured({
      feature: FEATURE_BY_TRIGGER[trigger],
      schema,
      system,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      userId,
      // The representative's id for a cluster: the summary and its ledger rows are keyed by it.
      refId: inputs.storyId,
    });
    return this.store({ storyId: inputs.storyId, trigger, result, basedOnComments });
  }

  private async find(storyId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, clusterId: true },
    });
    return story && this.findFor(story);
  }

  private async findFor(story: { id: string; clusterId: string | null }) {
    const row = await findSummary(this.prisma, story, this.env.FEATURE_CLUSTERS);
    return row && toStorySummary(row);
  }

  private async store({
    storyId,
    trigger,
    result,
    basedOnComments,
  }: {
    storyId: string;
    trigger: SummaryTrigger;
    result: StructuredResult<StorySummaryLlm>;
    basedOnComments: number;
  }): Promise<GenerateResult> {
    const consensus = storedConsensus(result.object.consensus, basedOnComments);
    try {
      const row = await this.prisma.summary.create({
        data: {
          storyId,
          tldr: result.object.tldr,
          consensus: consensus ?? Prisma.DbNull,
          suggestedTags: [],
          basedOnComments,
          trigger,
          model: result.model,
          promptVersion: PROMPT_VERSION,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: result.usage.costUsd.toFixed(6),
        },
      });
      return { kind: 'created', summary: toStorySummary(row) };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
      // A concurrent call stored this story's summary first; that one stays, and this one's cost is already in the ledger.
      const winner = await this.find(storyId);
      if (!winner) throw error;
      return { kind: 'raced', summary: winner };
    }
  }
}

/** Resolves with `generation`, or rejects as an unreachable upstream when `signal` aborts first. */
function untilAborted<Result>(
  generation: Promise<Result>,
  signal: AbortSignal | undefined,
  storyId: string,
) {
  if (!signal) return generation;
  return new Promise<Result>((resolve, reject) => {
    const abort = () =>
      reject(new SummaryInputsUnavailableError(storyId, 'upstream', { cause: signal.reason }));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    generation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
