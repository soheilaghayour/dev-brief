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
  StorySummaryLlmSchema,
} from '../llm/prompts/storySummary.v1.js';
import { lockClusterSummary } from './clusterSummaryLock.js';
import { SummaryInputsService } from './summaryInputs.service.js';
import { summaryRequest } from './summaryRequest.js';
import { storedConsensus } from './summaryRules.js';

/** `cached` when the story already had a summary and no model was called, `created` when this call wrote it, `raced` when a concurrent call stored one while this call's model request ran (its cost is in the ledger). */
export type GenerateResult = { kind: 'cached' | 'created' | 'raced'; summary: StorySummary };

const FEATURE_BY_TRIGGER = {
  auto: 'summary_auto',
  on_demand: 'summary_on_demand',
} as const satisfies Record<SummaryTrigger, LlmFeature>;

// The lock is held across the upstream fetches and the model call, which outlast Prisma's 5 s default.
const CLUSTER_LOCK_TRANSACTION = { maxWait: 10_000, timeout: 180_000 };

/** Reads and generates story summaries; a story or cluster is summarised at most once, and a failed generation stores nothing. */
@Injectable()
export class SummariesService {
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
    // A cached summary costs no fetch and no LLM call.
    const existing = await this.find(storyId);
    if (existing) return { kind: 'cached', summary: existing };

    const clusterId = await this.clusterOf(storyId);
    if (!clusterId) return this.generateAndStore(storyId, trigger, { userId, signal });
    // The lock lives in a transaction of its own; the reads and the insert use the pool, so they are committed before the lock is released.
    return this.prisma.$transaction(async (tx) => {
      await lockClusterSummary(tx, clusterId);
      // A request for another member may have stored the cluster's summary while this one waited.
      const stored = await this.find(storyId);
      if (stored) return { kind: 'cached' as const, summary: stored };
      return this.generateAndStore(storyId, trigger, { userId, signal });
    }, CLUSTER_LOCK_TRANSACTION);
  }

  private async clusterOf(storyId: string) {
    if (!this.env.FEATURE_CLUSTERS) return null;
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { clusterId: true },
    });
    return story?.clusterId ?? null;
  }

  private async generateAndStore(
    storyId: string,
    trigger: SummaryTrigger,
    { userId, signal }: { userId?: string; signal?: AbortSignal },
  ): Promise<GenerateResult> {
    const inputs = await this.inputs.collectSummaryInputs(storyId, { signal });
    const { system, prompt, basedOnComments } = summaryRequest(inputs);
    const result = await this.llm.generateStructured({
      feature: FEATURE_BY_TRIGGER[trigger],
      schema: StorySummaryLlmSchema,
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
    if (!story) return null;
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
