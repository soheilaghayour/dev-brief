import { Injectable } from '@nestjs/common';
import type { StorySummary } from '@devbrief/shared';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { toStorySummary } from '../../common/story-card/storyCard.mapper.js';
import { type LlmFeature, Prisma, type SummaryTrigger } from '../../generated/prisma/client.js';
import { LlmService, type StructuredResult } from '../llm/llm.service.js';
import {
  MAX_OUTPUT_TOKENS,
  PROMPT_VERSION,
  type StorySummaryLlm,
  StorySummaryLlmSchema,
} from '../llm/prompts/storySummary.v1.js';
import { SummaryInputsService } from './summaryInputs.service.js';
import { summaryRequest } from './summaryRequest.js';
import { storedConsensus } from './summaryRules.js';

/** `cached` when the story already had a summary (or a concurrent call stored one first), `created` when this call wrote it. */
export type GenerateResult = { kind: 'cached' | 'created'; summary: StorySummary };

const FEATURE_BY_TRIGGER = {
  auto: 'summary_auto',
  on_demand: 'summary_on_demand',
} as const satisfies Record<SummaryTrigger, LlmFeature>;

/** Reads and generates story summaries; a story is summarised at most once, and a failed generation stores nothing. */
@Injectable()
export class SummariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inputs: SummaryInputsService,
    private readonly llm: LlmService,
  ) {}

  /** The story's summary; throws `NOT_FOUND` when the story is unknown or has no summary yet. */
  async get(storyId: string) {
    const summary = await this.find(storyId);
    if (!summary) throw new ApiException('NOT_FOUND', 'This story has no summary yet.');
    return summary;
  }

  /** Returns the stored summary, or generates and stores one; throws `NOT_FOUND`, `SummaryInputsUnavailableError`, `SpendCapReachedError` or `GenerationFailedError`. */
  async generate(
    storyId: string,
    trigger: SummaryTrigger,
    { userId }: { userId?: string } = {},
  ): Promise<GenerateResult> {
    // A cached summary costs no fetch and no LLM call.
    const existing = await this.find(storyId);
    if (existing) return { kind: 'cached', summary: existing };

    const { system, prompt, basedOnComments } = summaryRequest(
      await this.inputs.collectSummaryInputs(storyId),
    );
    const result = await this.llm.generateStructured({
      feature: FEATURE_BY_TRIGGER[trigger],
      schema: StorySummaryLlmSchema,
      system,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      userId,
      refId: storyId,
    });
    return this.store({ storyId, trigger, result, basedOnComments });
  }

  private async find(storyId: string) {
    const row = await this.prisma.summary.findUnique({ where: { storyId } });
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
      return { kind: 'cached', summary: winner };
    }
  }
}
