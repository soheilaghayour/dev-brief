import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './createTestApp.js';
import { ProbeController } from './probe.controller.js';

const APP_ORIGIN = 'http://localhost:3000';

describe('API conventions', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp([ProbeController]);
  });
  afterAll(() => app.close());

  it('returns 400 VALIDATION_FAILED in the error envelope for an invalid query', async () => {
    const response = await request(server()).get('/api/v1/probe/feed?q=a&limit=99');
    expect(response.status).toBe(400);
    const { error } = ApiErrorSchema.parse(response.body);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.map((detail) => detail.path).sort()).toEqual(['limit', 'q']);
    expect(error.requestId).toBe(response.headers['x-request-id']);
  });

  it('parses a valid query, applies defaults and strips unknown keys', async () => {
    const response = await request(server()).get('/api/v1/probe/feed?q=react&unknown=1');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: 'react' });
  });

  it('validates a request body with the shared schema', async () => {
    const response = await request(server())
      .post('/api/v1/probe/lookup')
      .set('Origin', APP_ORIGIN)
      .send({ ids: [] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('AC-1.5.9 returns 403 FORBIDDEN_ORIGIN for a cross-origin POST and passes a same-origin POST', async () => {
    const crossOrigin = await request(server())
      .post('/api/v1/probe/lookup')
      .set('Origin', 'https://evil.example')
      .send({ ids: ['a'] });
    expect(crossOrigin.status).toBe(403);
    expect(ApiErrorSchema.parse(crossOrigin.body).error.code).toBe('FORBIDDEN_ORIGIN');

    const noOrigin = await request(server())
      .post('/api/v1/probe/lookup')
      .send({ ids: ['a'] });
    expect(noOrigin.status).toBe(403);

    const sameOrigin = await request(server())
      .post('/api/v1/probe/lookup')
      .set('Origin', APP_ORIGIN)
      .send({ ids: ['a'] });
    expect(sameOrigin.status).toBe(200);
    expect(sameOrigin.body).toEqual({ ids: ['a'] });
  });

  it('echoes a supplied x-request-id on the response and in the error body', async () => {
    const response = await request(server())
      .get('/api/v1/probe/feed?q=a')
      .set('x-request-id', 'trace-123');
    expect(response.headers['x-request-id']).toBe('trace-123');
    expect(response.body.error.requestId).toBe('trace-123');
  });

  it('generates an x-request-id when none is supplied or the supplied one is unsafe', async () => {
    const generated = await request(server()).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const unsafe = await request(server()).get('/api/v1/health').set('x-request-id', 'a b\tc');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 500 INTERNAL without a stack trace or the error message', async () => {
    const response = await request(server()).get('/api/v1/probe/explode');
    expect(response.status).toBe(500);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('INTERNAL');
    expect(response.text).not.toMatch(/hunter2|secret|\sat\s.+\.ts/);
  });

  it('returns 500 INTERNAL when a response does not match its declared schema', async () => {
    const response = await request(server()).get('/api/v1/probe/bad-output');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL');
  });

  it('returns 404 NOT_FOUND in the envelope for an unknown route', async () => {
    const response = await request(server()).get('/api/v1/nope');
    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('sets the public Cache-Control header through PublicCache', async () => {
    const response = await request(server()).get('/api/v1/probe/feed');
    expect(response.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
  });

  it('sets the API security headers', async () => {
    const response = await request(server()).get('/api/v1/health');
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('AC-1.7.2 serves the OpenAPI 3.1 document generated from the contracts', async () => {
    const response = await request(server()).get('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\.1\./);
    const feedQuery = response.body.paths['/api/v1/probe/feed'].get.parameters;
    expect(feedQuery.map((parameter: { name: string }) => parameter.name)).toContain('tags');
    const lookup = response.body.paths['/api/v1/probe/lookup'].post;
    expect(lookup.requestBody.content['application/json'].schema.properties.ids.maxItems).toBe(100);
    const feedResponse = response.body.paths['/api/v1/probe/feed'].get.responses['200'];
    expect(feedResponse.content['application/json'].schema.properties.nextCursor).toBeDefined();
  });

  it('AC-1.7.2 serves Swagger UI at /api/v1/docs', async () => {
    const response = await request(server()).get('/api/v1/docs');
    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });
});
