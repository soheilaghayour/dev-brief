import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, type ApiBodyOptions } from '@nestjs/swagger';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const RESPONSE_SCHEMA_KEY = 'contract:responseSchema';

type OpenApiSchema = NonNullable<Extract<ApiBodyOptions, { schema: unknown }>['schema']>;

type Contract = {
  query?: z.AnyZodObject;
  body?: z.ZodTypeAny;
  response?: z.ZodTypeAny;
};

// OpenAPI 3.1 uses JSON Schema directly, so the Zod schemas convert without OpenAPI-3.0 tweaks.
function toOpenApiSchema(schema: z.ZodTypeAny) {
  const jsonSchema: Record<string, unknown> = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
    pipeStrategy: 'input',
  });
  delete jsonSchema.$schema;
  return jsonSchema as OpenApiSchema;
}

function queryParameterDecorators(query: z.AnyZodObject) {
  const { properties = {}, required = [] } = toOpenApiSchema(query) as {
    properties?: Record<string, OpenApiSchema>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, schema]) =>
    ApiQuery({ name, required: required.includes(name), schema }),
  );
}

/** Documents a route in OpenAPI from its shared schemas and makes the output interceptor check the response against `response`. */
export function Contract({ query, body, response }: Contract) {
  return applyDecorators(
    ...(query ? queryParameterDecorators(query) : []),
    ...(body ? [ApiBody({ schema: toOpenApiSchema(body) })] : []),
    ...(response
      ? [
          ApiOkResponse({ schema: toOpenApiSchema(response) }),
          SetMetadata(RESPONSE_SCHEMA_KEY, response),
        ]
      : []),
  );
}
