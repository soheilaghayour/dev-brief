/** Runs at most `limit` jobs at once; a finished job hands its slot straight to the next waiting one. */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <Result>(job: () => Promise<Result>) => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await job();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
