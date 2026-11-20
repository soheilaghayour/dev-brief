// Marks the build's first-load chunks for background compilation in Chrome (DECISIONS.md).
import { fileURLToPath } from 'node:url';
import { addCompileHints } from './compileHints.mjs';

const nextDir = fileURLToPath(new URL('../.next', import.meta.url));
console.log(`Compile hints added to ${addCompileHints(nextDir)} first-load chunks`);
