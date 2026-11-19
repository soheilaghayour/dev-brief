import { Injectable } from '@nestjs/common';

/** Work that follows a run once every source has settled, such as the rank recompute. */
export interface IngestionPostRunStep {
  readonly name: string;
  run(context: { runId: string; now: Date }): Promise<void>;
}

/** Holds the post-run steps; other modules register theirs, and the engine runs them in order. */
@Injectable()
export class IngestionPostRunSteps {
  private readonly steps: IngestionPostRunStep[] = [];

  register(step: IngestionPostRunStep) {
    this.steps.push(step);
  }

  list(): readonly IngestionPostRunStep[] {
    return this.steps;
  }
}
