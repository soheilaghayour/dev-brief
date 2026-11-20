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
import { ClusterPoolService, type ClusterWindowRow } from './clusterPool.service.js';
import { clusterFailureAction } from './clusteringRules.js';

type NewStory = {
  id: string;
  title: string;
  url: string;
  domain: string;
  excerpt: string | null;
  normalizedTitle: string;
  publishedAt: Date;
};

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
    // CI's e2e API runs with clusters on and a placeholder key, so the live calls need a switch of their own.
    if (!this.env.FEATURE_CLUSTERS || !this.env.AUTO_CLUSTERING) return;

    // Stories first seen before this run were decided (or not) in the run that created them.
    const created = await this.prisma.story.findMany({
      where: { firstSeenAt: { gte: startedAt } },
      select: {
        id: true,
        title: true,
        url: true,
        domain: true,
        excerpt: true,
        normalizedTitle: true,
        publishedAt: true,
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    });
    for (const [index, story] of created.entries()) {
      if (signal.aborted) {
        this.logger.warn('Clustering stopped: the run budget is spent');
        return;
      }
      const undecided = created.slice(index + 1).map(({ id }) => id);
      try {
        await this.decide(story, undecided);
      } catch (error) {
        const action = clusterFailureAction(error);
        if (action === 'unexpected') throw error;
        this.logger.warn(`Clustering of story ${story.id} failed (${action}): ${String(error)}`);
        if (action === 'stop') return;
      }
    }
  }

  private async decide(story: NewStory, undecided: readonly string[]) {
    const candidates = rankClusterCandidates(story, await this.pool.windowOf(story, undecided));
    // No candidate, no call: the story stays single with a null score.
    if (candidates.length === 0) return;

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
    });
    const decision = clusterDecision(reply, labelled);
    this.logDecision(story, labelled, reply);
    await this.membership.record(
      story.id,
      decision.kind === 'join'
        ? { kind: 'join', clusterScore: decision.clusterScore, target: decision.target }
        : { kind: 'single', clusterScore: decision.clusterScore },
    );
  }

  private logDecision(
    story: NewStory,
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
