import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { initSentry } from './config/sentry';
import * as express from 'express';
import helmet from 'helmet';

async function bootstrap() {
  // Initialize Sentry before creating the app
  initSentry();

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:8081'],
    credentials: true,
  });

  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now — mobile API doesn't serve HTML
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
    },
  }));

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
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Mizanly API')
      .setDescription('Backend API for the Mizanly social platform')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // Pino Logger
  app.useLogger(app.get(Logger));

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`🟢 Mizanly API running on port ${port}`);
}

bootstrap();
