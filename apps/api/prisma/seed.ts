import { pathToFileURL } from 'node:url';
import { runSeed } from '../src/cli/seedSources.js';

export { seedSources } from '../src/cli/seedSources.js';

// Vitest imports seedSources; only a direct run (prisma db seed) seeds the database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSeed();
}
