import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Serves the OpenAPI 3.1 document at `/api/v1/openapi.json` and Swagger UI at `/api/v1/docs`. */
export function setupOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('DevBrief API')
    .setVersion('1')
    .setOpenAPIVersion('3.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config), {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
  });
}
