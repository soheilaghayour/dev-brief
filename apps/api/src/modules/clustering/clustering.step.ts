import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { clusterDecision, type ClusterCandidate, rankClusterCandidates } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  IngestionPostRunSteps,
  type IngestionPostRunStep,
  type PostRunContext,
} from '../ingestion/postRunStep.js';
import { LlmService } from '../llm/llm.service.js';
import {
  buildClusterMatchPrompt,
  candidateLabel,
  clusterMatchSchema,
  MAX_OUTPUT_TOKENS,
  SYSTEM_PROMPT,
} from '../llm/prompts/clusterMatch.v1.js';
import { ClusterMembershipService } from './clusterMembership.service.js';
import {
  type ClusterPool,
  ClusterPoolService,
  type ClusterWindowRow,
} from './clusterPool.service.js';
import {
  CLUSTER_MAX_CALLS_PER_RUN,
  CLUSTER_MAX_CONSECUTIVE_ERRORS,
  clusterFailureAction,
} from './clusteringRules.js';

/** After the sources settle, decides for each story this run created whether it reports the same event as a nearby story. */
@Injectable()
export class ClusteringStep implements IngestionPostRunStep, OnModuleInit {
  readonly name = 'clustering';
  private readonly logger = new Logger(ClusteringStep.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pool: ClusterPoolService,
    private readonly membership: ClusterMembershipService,
    private readonly llm: LlmService,
    private readonly postRunSteps: IngestionPostRunSteps,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    this.postRunSteps.register(this);
  }

  async run({ startedAt, signal }: PostRunContext) {
    // The e2e API in CI runs with clusters on and a placeholder key, so the live calls need a switch of their own.
    if (!this.env.FEATURE_CLUSTERS || !this.env.AUTO_CLUSTERING) return;

    const { created, pool } = await this.pool.load(startedAt);
    let calls = 0;
    let consecutiveErrors = 0;
    for (const story of created) {
      if (signal.aborted) {
        this.logger.warn('Clustering stopped: the run budget is spent');
        return;
      }
      if (calls >= CLUSTER_MAX_CALLS_PER_RUN) {
        this.logger.warn('Clustering stopped: the run made its maximum of model calls');
        return;
      }
      try {
        if (await this.decide(story, pool, signal)) calls += 1;
        consecutiveErrors = 0;
      } catch (error) {
        const action = clusterFailureAction(error);
        this.logger.warn(`Clustering of story ${story.id} failed (${action}): ${String(error)}`);
        if (action === 'stop') return;
        consecutiveErrors = action === 'unexpected' ? consecutiveErrors + 1 : 0;
        if (consecutiveErrors >= CLUSTER_MAX_CONSECUTIVE_ERRORS) {
          this.logger.error('Clustering stopped: three stories in a row failed unexpectedly');
          return;
        }
        // A model call that failed was still made, so it counts against the run's maximum.
        if (action === 'skip') calls += 1;
      } finally {
        pool.markDecided(story.id);
      }
    }
  }

  /** Decides one story; returns whether it made a model call. */
  private async decide(story: ClusterWindowRow, pool: ClusterPool, signal: AbortSignal) {
    const candidates = rankClusterCandidates(story, pool.windowOf(story));
    // No candidate, no call: the story stays single with a null score.
    if (candidates.length === 0) return false;

    const labelled = candidates.map((candidate, index) => ({
      label: candidateLabel(index),
      target: candidate,
    }));
    const { object: reply } = await this.llm.generateStructured({
      feature: 'cluster',
      schema: clusterMatchSchema(labelled.map(({ label }) => label)),
      system: SYSTEM_PROMPT,
      prompt: buildClusterMatchPrompt(story, candidates),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      refId: story.id,
      signal,
    });
    const decision = clusterDecision(reply, labelled);
    this.logDecision(story, labelled, reply);
    const result = await this.membership.record(
      story.id,
      decision.kind === 'join'
        ? { kind: 'join', clusterScore: decision.clusterScore, target: decision.target }
        : { kind: 'single', clusterScore: decision.clusterScore },
    );
    if (decision.kind === 'join') pool.applyJoin(story.id, decision.target.id, result);
    return true;
  }

  private logDecision(
    story: ClusterWindowRow,
    labelled: readonly { label: string; target: ClusterCandidate<ClusterWindowRow> }[],
    reply: { match: string; confidence: number },
  ) {
    const scores = labelled
      .map(({ label, target }) => `${label}=${target.id}:${target.candidateScore.toFixed(2)}`)
      .join(' ');
    this.logger.log(
      `Story ${story.id}: candidates [${scores}] match=${reply.match} confidence=${reply.confidence}`,
    );
  }
}
