import * as Sentry from '@sentry/nestjs';
import { loadEnv } from './env.js';
import { sentryOptions } from './sentryOptions.js';

// Imported first by main.ts so Sentry can instrument Express and pg before they load.
Sentry.init(sentryOptions(loadEnv()));
