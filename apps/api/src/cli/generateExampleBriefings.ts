import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import {
  describeCliFailure,
  generateExampleBriefings,
  GenerateExampleBriefingsModule,
} from './generateExampleBriefings.module.js';

try {
  const { values } = parseArgs({ options: { 'confirm-database': { type: 'string' } } });
  const app = await NestFactory.createApplicationContext(GenerateExampleBriefingsModule);
  try {
    await generateExampleBriefings(app, { confirmedDatabase: values['confirm-database'] });
  } finally {
    await app.close();
  }
} catch (error) {
  console.error(describeCliFailure(error));
  process.exitCode = 1;
}
