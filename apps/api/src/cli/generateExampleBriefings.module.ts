import 'reflect-metadata';
import { type INestApplicationContext, Module } from '@nestjs/common';
import {
  A2uiServerMessageSchema,
  EXAMPLE_QUESTIONS,
  type A2uiServerMessage,
} from '@devbrief/shared';
import { CacheModule } from '../common/cache/cache.module.js';
import { ENV, EnvModule, type Env } from '../common/env/env.module.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BriefingPipelineService } from '../modules/copilot/briefingPipeline.service.js';
import { BriefingRetrievalService } from '../modules/copilot/briefingRetrieval.service.js';
import { CopilotModule } from '../modules/copilot/copilot.module.js';
import { MIN_COVERAGE_STORIES } from '../modules/copilot/noCoverageBriefing.js';
import { confirmDatabase } from './confirmDatabase.js';

// CopilotModule, not CopilotHttpModule: the CLI needs no routes and no Better Auth.
@Module({ imports: [EnvModule, PrismaModule, CacheModule, CopilotModule] })
export class GenerateExampleBriefingsModule {}

type ExampleQuestion = { slug: string; question: string };

/** Raised for every reason the run stops before it replaces anything. */
export class ExampleGenerationError extends Error {}

/** Runs the copilot pipeline for each example question and replaces the stored rows in one transaction, or changes nothing. */
export async function generateExampleBriefings(
  app: INestApplicationContext,
  {
    confirmedDatabase,
    questions = EXAMPLE_QUESTIONS,
    log = console.log,
  }: {
    /** The `--confirm-database` value. */
    confirmedDatabase: string | undefined;
    questions?: readonly ExampleQuestion[];
    log?: (line: string) => void;
  },
) {
  const env = app.get<Env>(ENV);
  const confirmation = confirmDatabase(env.DATABASE_URL, confirmedDatabase);
  if (confirmation.kind === 'refused') throw new ExampleGenerationError(confirmation.reason);
  if (!env.ANTHROPIC_API_KEY) {
    throw new ExampleGenerationError('ANTHROPIC_API_KEY is required to generate the examples.');
  }

  await checkCoverage(app.get(BriefingRetrievalService), questions, log);

  const pipeline = app.get(BriefingPipelineService);
  const generated: { slug: string; question: string; messages: A2uiServerMessage[] }[] = [];
  let totalCostUsd = 0;
  for (const { slug, question } of questions) {
    const { messages, costUsd } = await generateOne(pipeline, { slug, question });
    log(`${slug}: $${costUsd.toFixed(5)}, ${messages.length} messages`);
    generated.push({ slug, question, messages });
    totalCostUsd += costUsd;
  }

  const generatedAt = new Date();
  const prisma = app.get(PrismaService);
  await prisma.$transaction([
    prisma.exampleBriefing.deleteMany(),
    prisma.exampleBriefing.createMany({
      data: generated.map(({ slug, question, messages }, position) => ({
        slug,
        question,
        // Zod's inferred message type has no index signature, so Prisma's JSON input type rejects it though it is plain JSON.
        messages: messages as unknown as Prisma.InputJsonValue,
        position,
        generatedAt,
      })),
    }),
  ]);
  log(`Total: $${totalCostUsd.toFixed(5)} for ${generated.length} briefings`);
  return { slugs: generated.map(({ slug }) => slug), totalCostUsd };
}

/** Reports each question's story count before any model call and fails when one is under the coverage minimum: a no-coverage answer is no example, and failing first spends nothing. */
async function checkCoverage(
  retrieval: BriefingRetrievalService,
  questions: readonly ExampleQuestion[],
  log: (line: string) => void,
) {
  const thin: string[] = [];
  for (const { slug, question } of questions) {
    const { stories } = await retrieval.retrieve(question);
    log(`${slug}: ${stories.length} stories retrieved`);
    if (stories.length < MIN_COVERAGE_STORIES) thin.push(`${slug} ("${question}")`);
  }
  if (thin.length > 0) {
    throw new ExampleGenerationError(
      `Fewer than ${MIN_COVERAGE_STORIES} stories for: ${thin.join(', ')}. Nothing was changed; ask the owner for a replacement question.`,
    );
  }
}

async function generateOne(pipeline: BriefingPipelineService, { slug, question }: ExampleQuestion) {
  const messages: A2uiServerMessage[] = [];
  let costUsd: number | undefined;
  const run = pipeline.run({ question, surfaceId: `example-${slug}`, refId: `example-${slug}` });
  for await (const event of run) {
    if (event.kind === 'no_coverage') {
      throw new ExampleGenerationError(`"${slug}" has no coverage; nothing was changed.`);
    }
    if (event.kind === 'failed') {
      throw new ExampleGenerationError(
        `"${slug}" failed (${event.error.message}); nothing was changed.`,
      );
    }
    if (event.kind === 'message') messages.push(A2uiServerMessageSchema.parse(event.message));
    else costUsd = event.costUsd;
  }
  if (costUsd === undefined) {
    throw new ExampleGenerationError(`"${slug}" ended without completing; nothing was changed.`);
  }
  return { messages, costUsd };
}
