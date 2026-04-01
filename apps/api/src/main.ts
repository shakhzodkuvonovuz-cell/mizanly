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
  const isProduction = process.env.NODE_ENV === 'production';

  const required: [string, string][] = [
    ['DATABASE_URL', 'PostgreSQL connection string'],
    ['CLERK_SECRET_KEY', 'Clerk authentication'],
  ];

  // These are required in production — missing them causes silent security degradation
  const requiredInProd: [string, string][] = [
    ['REDIS_URL', 'Redis (rate limiting, queues, presence — without it: no rate limiting = DDoS vector)'],
    ['TOTP_ENCRYPTION_KEY', '2FA encryption (without it: TOTP secrets stored in plaintext)'],
    ['R2_ACCOUNT_ID', 'Cloudflare R2 (file uploads)'],
    ['R2_ACCESS_KEY_ID', 'Cloudflare R2 access key'],
    ['R2_SECRET_ACCESS_KEY', 'Cloudflare R2 secret key'],
    ['STRIPE_WEBHOOK_SECRET', 'Stripe webhook signature verification'],
  ];

  const recommended: [string, string][] = [
    ['CLERK_PUBLISHABLE_KEY', 'Clerk frontend key'],
    ['STRIPE_SECRET_KEY', 'Stripe payments'],
    ['ANTHROPIC_API_KEY', 'AI features (Claude)'],
    ['SENTRY_DSN', 'Error monitoring'],
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

  // In production, promote critical vars to required
  if (isProduction) {
    for (const [key, desc] of requiredInProd) {
      if (!process.env[key]) {
        logger.error(`Missing env var required in production: ${key} — ${desc}`);
        fatal = true;
      }
    }

    // Prevent deploying with test keys in production
    const clerkKey = process.env.CLERK_SECRET_KEY || '';
    if (clerkKey.includes('_test_')) {
      logger.error('CLERK_SECRET_KEY is a test key — production requires a live key (sk_live_...)');
      fatal = true;
    }
    const stripeKey = process.env.STRIPE_SECRET_KEY || '';
    if (stripeKey.includes('_test_')) {
      logger.error('STRIPE_SECRET_KEY is a test key — production requires a live key (sk_live_...)');
      fatal = true;
    }
  }

  if (fatal) {
    logger.error('Cannot start — required environment variables are missing');
    process.exit(1);
  }

  // Non-production: warn about production-required vars
  if (!isProduction) {
    for (const [key, desc] of requiredInProd) {
      if (!process.env[key]) {
        logger.warn(`Missing env var (required in production): ${key} — ${desc}`);
      }
    }
  }

  for (const [key, desc] of recommended) {
    if (!process.env[key]) {
      logger.warn(`Missing recommended env var: ${key} — ${desc} (will use fallback)`);
    }
  }

  // Warn if production database credentials are used in development mode
  if (!isProduction) {
    const dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl.includes('neon.tech') || dbUrl.includes('amazonaws.com') || dbUrl.includes('.rds.')) {
      logger.warn(
        'Production database credentials detected in development mode. ' +
        'Consider using a Neon branch or local PostgreSQL for development. ' +
        'See: https://neon.tech/docs/introduction/branching',
      );
    }
  }

  // Warn about NODE_ENV — Swagger and stack traces leak if not set to 'production'
  if (!process.env.NODE_ENV) {
    logger.warn('NODE_ENV is not set — defaulting to development mode (Swagger enabled, verbose errors). Set NODE_ENV=production for production deploys.');
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

  // CORS — unified policy (CODEX #26: same logic for HTTP and WebSocket)
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && corsOrigins.length === 0) {
    new Logger('CORS').warn(
      'CORS_ORIGINS is empty in production — all cross-origin requests will be rejected. ' +
      'Set CORS_ORIGINS to your frontend domain(s) (comma-separated).',
    );
  }
  app.enableCors({
    origin: corsOrigins.length > 0
      ? corsOrigins
      : isProduction
        ? false // Production: reject all if no origins configured (secure default)
        : ['http://localhost:8081', 'http://localhost:8082'], // Dev convenience
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    maxAge: 86400,
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

  // Phase 3: Request latency observability
  const { MetricsInterceptor } = await import('./common/interceptors/metrics.interceptor');
  app.useGlobalInterceptors(new MetricsInterceptor());

  // Validation + Sanitization
  const { SanitizePipe } = await import('./common/pipes/sanitize.pipe');
  app.useGlobalPipes(
    new SanitizePipe(), // CODEX #7: sanitize all request body strings globally
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
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
  const socketAdapter = await initRedisAdapter(app);

  // Clean up Redis adapter connections on shutdown
  process.on('SIGTERM', () => socketAdapter.disconnect());
  process.on('SIGINT', () => socketAdapter.disconnect());

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Mizanly API running on port ${port}`);
}

bootstrap();
