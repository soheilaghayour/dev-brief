import { Injectable, Logger } from '@nestjs/common';
import type { A2uiServerMessage } from '@devbrief/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { computeTagVelocity, radarStartDay } from '../../common/tag-velocity/tagVelocity.js';
import { GenerationFailedError } from '../llm/llm.errors.js';
import { LlmService } from '../llm/llm.service.js';
import {
  BriefingPlanLlmSchema,
  BriefingSectionLlmSchema,
  BriefingTitleLlmSchema,
  buildCopilotPrompt,
  fixedInputTokens,
  MAX_OUTPUT_TOKENS,
  SYSTEM_PROMPT,
} from '../llm/prompts/copilotBriefing.v1.js';
import type { TokenUsage } from '../llm/spendLedger.service.js';
import { BriefingRetrievalService } from './briefingRetrieval.service.js';
import {
  compileSection,
  createSurfaceMessage,
  rootMessage,
  subtitleMessage,
  type CompileContext,
} from './compileBriefing.js';
import { noCoverageBriefing } from './noCoverageBriefing.js';

export type PipelineEvent =
  /** Too few stories: the whole answer, with no model call. */
  | { kind: 'no_coverage'; messages: A2uiServerMessage[] }
  /** `section` marks a compiled section: something the reader can use, unlike the opening surface, root and subtitle. */
  | { kind: 'message'; message: A2uiServerMessage; section: boolean }
  | {
      kind: 'complete';
      usage: TokenUsage;
      costUsd: number;
      /** The retrieved stories the briefing shows or cites. */
      storyIds: string[];
    }
  /** The model call failed or its plan was unusable. */
  | { kind: 'failed'; error: GenerationFailedError };

const logger = new Logger('BriefingPipeline');

/** Question → retrieved stories → streamed BriefingPlan → compiled A2UI messages (PRD §4.3.4). */
@Injectable()
export class BriefingPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: BriefingRetrievalService,
    private readonly llm: LlmService,
  ) {}

  /** Yields the briefing as it is built, ending with `failed` rather than throwing when the generation fails. */
  async *run({
    question,
    surfaceId,
    refId,
    signal,
    userId,
  }: {
    question: string;
    surfaceId: string;
    /** The id the model call's ledger row is filed under. */
    refId?: string;
    signal?: AbortSignal;
    userId?: string;
  }): AsyncGenerator<PipelineEvent, void> {
    const retrieval = await this.retrieval.retrieve(question);
    if (retrieval.kind === 'no_coverage') {
      yield {
        kind: 'no_coverage',
        messages: noCoverageBriefing({
          question,
          suggestedTags: retrieval.suggestedTags,
          surfaceId,
        }),
      };
      return;
    }

    const { stories } = retrieval;
    const now = new Date();
    const stats = await this.prisma.tagDailyStat.findMany({
      where: { day: { gte: radarStartDay('30d', now) } },
    });
    const prompt = buildCopilotPrompt({
      question,
      stories,
      fixedTokens: await fixedInputTokens(),
    });
    const plan = this.llm.streamPlan({
      feature: 'copilot',
      schema: BriefingPlanLlmSchema,
      titleSchema: BriefingTitleLlmSchema,
      sectionSchema: BriefingSectionLlmSchema,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      userId,
      refId,
      signal,
    });

    const context: CompileContext = {
      surfaceId,
      title: '',
      stories,
      radar: (query) => computeTagVelocity({ stats, now, ...query }),
    };
    let childIds: string[] = [];
    const storyIds = new Set<string>();
    try {
      for await (const event of plan) {
        if (event.kind === 'title') {
          // Nothing is sent before the title: the first token proves the call is live, so a spent cap or an early failure sends nothing.
          context.title = event.title;
          yield { kind: 'message', message: createSurfaceMessage(surfaceId), section: false };
          yield { kind: 'message', message: rootMessage(surfaceId, event.title), section: false };
          yield { kind: 'message', message: subtitleMessage(surfaceId, stories), section: false };
        } else if (event.kind === 'section') {
          const compiled = compileSection(event.section, event.index, childIds, context);
          if (compiled.kind === 'invalid') {
            logger.warn(`Section ${event.index} failed the catalog schema: ${compiled.issues}`);
          }
          if (compiled.kind !== 'compiled') continue;
          childIds = compiled.childIds;
          for (const id of compiled.storyIds) storyIds.add(id);
          yield { kind: 'message', message: compiled.message, section: true };
        } else {
          if (childIds.length === 0) throw new GenerationFailedError('invalid_output');
          yield {
            kind: 'complete',
            usage: {
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
            },
            costUsd: event.usage.costUsd,
            storyIds: [...storyIds],
          };
        }
      }
    } catch (error) {
      if (!(error instanceof GenerationFailedError)) throw error;
      yield { kind: 'failed', error };
    }
  }
}
