// Marks the build's client chunks for eager background compilation (DECISIONS.md). Runs after `next build`.
import { fileURLToPath } from 'node:url';
import { addCompileHints } from './compileHints.mjs';

const nextDir = fileURLToPath(new URL('../.next', import.meta.url));
console.log(`Compile hints added to ${addCompileHints(nextDir)} client chunks`);
