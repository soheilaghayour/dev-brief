import { loadEnv } from './env';

// Runs at server start, so a bad environment fails fast in the standalone production server too.
export function register() {
  try {
    loadEnv();
  } catch (error) {
    console.error(error);
    // Next logs a failed hook and keeps serving, so the process must exit itself.
    if (process.env.NEXT_RUNTIME === 'nodejs') process.exit(1);
    throw error;
  }
}
