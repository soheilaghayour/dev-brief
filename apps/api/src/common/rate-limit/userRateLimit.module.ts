import { Global, Injectable, Module } from '@nestjs/common';

export const RATE_LIMIT_WINDOW_MS = 60_000;

type Window = { startedAt: number; count: number };

/** The open window per bucket and user, one instance app-wide. */
@Injectable()
export class RateLimitWindows {
  private readonly windows = new Map<string, Window>();

  /** Counts one request against the key's window, opening a new window when the last one ended. */
  hit(key: string, now: number) {
    let window = this.windows.get(key);
    if (!window || now - window.startedAt >= RATE_LIMIT_WINDOW_MS) {
      this.dropExpired(now);
      window = { startedAt: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window;
  }

  private dropExpired(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= RATE_LIMIT_WINDOW_MS) this.windows.delete(key);
    }
  }
}

// Nest builds one guard instance per module that uses it, so the windows live in a global provider for buckets to span modules.
@Global()
@Module({ providers: [RateLimitWindows], exports: [RateLimitWindows] })
export class UserRateLimitModule {}
