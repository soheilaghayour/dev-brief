import { Injectable } from '@nestjs/common';

/** PRD §4.3.1: the order the post-run steps run in, whatever order their modules register them. */
const POST_RUN_ORDER = ['rank-recompute', 'auto-summaries'] as const;

/** Work that follows a run once every source has settled, such as the rank recompute. */
export interface IngestionPostRunStep {
  readonly name: (typeof POST_RUN_ORDER)[number];
  run(context: { runId: string; now: Date }): Promise<void>;
}

/** Holds the post-run steps; other modules register theirs, and the engine runs them in `POST_RUN_ORDER`. */
@Injectable()
export class IngestionPostRunSteps {
  private readonly steps: IngestionPostRunStep[] = [];

  register(step: IngestionPostRunStep) {
    this.steps.push(step);
  }

  list(): readonly IngestionPostRunStep[] {
    return this.steps.toSorted(
      (a, b) => POST_RUN_ORDER.indexOf(a.name) - POST_RUN_ORDER.indexOf(b.name),
    );
  }
}
