import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { initSentry } from './config/sentry';
import { initRedisAdapter } from './config/socket-io-adapter';
import * as express from 'express';
import helmet from 'helmet';
import * as compression from 'compression';

function validateEnv() {
  const logger = new Logger('EnvValidation');
  const required: [string, string][] = [
    ['DATABASE_URL', 'PostgreSQL connection string'],
    ['CLERK_SECRET_KEY', 'Clerk authentication'],
  ];
  const recommended: [string, string][] = [
    ['REDIS_URL', 'Redis (caching, rate limiting, presence, queues)'],
    ['CLERK_PUBLISHABLE_KEY', 'Clerk frontend key'],
    ['STRIPE_SECRET_KEY', 'Stripe payments'],
    ['ANTHROPIC_API_KEY', 'AI features (Claude)'],
    ['SENTRY_DSN', 'Error monitoring'],
    ['R2_ACCOUNT_ID', 'Cloudflare R2 (file uploads)'],
    ['R2_ACCESS_KEY_ID', 'Cloudflare R2 access key'],
    ['R2_SECRET_ACCESS_KEY', 'Cloudflare R2 secret key'],
    ['R2_PUBLIC_URL', 'Cloudflare R2 public URL'],
    ['CF_STREAM_ACCOUNT_ID', 'Cloudflare Stream (video hosting)'],
    ['CF_STREAM_API_TOKEN', 'Cloudflare Stream API token'],
    ['MEILISEARCH_HOST', 'Meilisearch (full-text search)'],
    ['OPENAI_API_KEY', 'OpenAI Whisper (voice transcription)'],
    ['GEMINI_API_KEY', 'Gemini (embeddings/recommendations)'],
    ['CORS_ORIGINS', 'CORS allowed origins'],
  ];

  let fatal = false;
  for (const [key, desc] of required) {
    if (!process.env[key]) {
      logger.error(`Missing required env var: ${key} — ${desc}`);
      fatal = true;
    }
  }
  if (fatal) {
    logger.error('Cannot start — required environment variables are missing');
    process.exit(1);
  }

  for (const [key, desc] of recommended) {
    if (!process.env[key]) {
      logger.warn(`Missing recommended env var: ${key} — ${desc} (will use fallback)`);
    }
  }
}

async function bootstrap() {
  // Validate environment before anything else
  validateEnv();

  // Initialize Sentry before creating the app
  initSentry();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS — production origins set via CORS_ORIGINS env var
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || ['http://localhost:8081', 'http://localhost:8082'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    maxAge: 86400, // Cache preflight for 24 hours
  });

  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now — mobile API doesn't serve HTML
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
    },
  }));
  app.use(compression());

  // Request body size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Global filter + interceptor
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // enableImplicitConversion: converts "true"→true, "123"→123 for query params.
      // Required because NestJS query params arrive as strings. Without this,
      // @IsNumber()/@IsBoolean() DTOs would always fail on query strings.
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger — only enabled in development (explicitly check for 'development' or undefined)
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('Mizanly API')
      .setDescription(
        'Backend API for the Mizanly social platform.\n\n' +
        '**Authentication:** Bearer token (Clerk JWT) in Authorization header.\n\n' +
        '**Pagination:** Cursor-based — pass `cursor` from response `meta.cursor` to get the next page.\n\n' +
        '**Rate Limiting:** 100 requests/minute per IP (default). Some endpoints have stricter limits.\n\n' +
        '**Response Format:** All responses wrapped in `{ success, data, timestamp }` envelope.'
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addServer(process.env.API_URL || 'http://localhost:3000', 'API Server')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: 'Mizanly API Docs',
      swaggerOptions: {
        persistAuthorization: true,
        filter: true,
        displayRequestDuration: true,
      },
    });
  }

  app.enableShutdownHooks();

  // Wire up Socket.io Redis adapter for horizontal scaling
  await initRedisAdapter(app);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`🟢 Mizanly API running on port ${port}`);
}

bootstrap();
