import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import {
  ExampleGenerationError,
  generateExampleBriefings,
  GenerateExampleBriefingsModule,
} from './generateExampleBriefings.module.js';

const { values } = parseArgs({ options: { 'confirm-database': { type: 'string' } } });

const app = await NestFactory.createApplicationContext(GenerateExampleBriefingsModule);
try {
  await generateExampleBriefings(app, { confirmedDatabase: values['confirm-database'] });
} catch (error) {
  console.error(error instanceof ExampleGenerationError ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}
