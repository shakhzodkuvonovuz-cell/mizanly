import * as fs from 'fs';
import * as path from 'path';
import { createHmac } from 'crypto';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

describe('Queue Security', () => {
  describe('K04-#1: Webhook secret not in Redis job data', () => {
    it('webhook processor interface should not have secret field', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/processors/webhook.processor.ts'), 'utf8');
      // The interface should have signature+timestamp, not secret
      expect(content).toContain('signature: string');
      expect(content).toContain('timestamp: string');
      // The old 'secret: string' field should be gone from the interface
      const interfaceMatch = content.match(/interface WebhookJobData \{[\s\S]*?\}/);
      expect(interfaceMatch).toBeTruthy();
      expect(interfaceMatch![0]).not.toContain('secret: string');
    });

    it('HMAC signature should be deterministic for same input', () => {
      const secret = 'test_secret_key';
      const body = JSON.stringify({ id: '123' });
      const timestamp = '1711872000';

      const sig1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
      const sig2 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
      expect(sig1).toBe(sig2);
    });

    it('HMAC signature should differ for different secrets', () => {
      const body = JSON.stringify({ id: '123' });
      const timestamp = '1711872000';

      const sig1 = createHmac('sha256', 'secret1').update(`${timestamp}.${body}`).digest('hex');
      const sig2 = createHmac('sha256', 'secret2').update(`${timestamp}.${body}`).digest('hex');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('K04-#16: Push notification deduplication', () => {
    it('queue service should use notificationId as jobId', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/queue.service.ts'), 'utf8');
      expect(content).toContain('jobId: `push:${data.notificationId}`');
    });
  });

  describe('#118: Webhook content-hash dedup', () => {
    it('webhook jobId should use content hash not timestamp', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/queue.service.ts'), 'utf8');
      // Should use a hash-based jobId, not timestamp-based
      expect(content).toContain('jobId: `wh:${payloadHash}`');
      expect(content).toContain("createHash('sha256')");
    });
  });

  describe('K04-#9: Worker error handlers', () => {
    const processors = [
      'notification.processor.ts',
      'webhook.processor.ts',
      'analytics.processor.ts',
      'media.processor.ts',
      'search-indexing.processor.ts',
      'ai-tasks.processor.ts',
    ];

    it.each(processors)('%s should have on(error) handler', (file) => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/processors', file), 'utf8');
      expect(content).toContain("on('error'");
    });

    it.each(processors)('%s should have on(stalled) handler', (file) => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/processors', file), 'utf8');
      expect(content).toContain("on('stalled'");
    });
  });

  describe('#117: maxStalledCount on all workers', () => {
    const processors = [
      'notification.processor.ts',
      'webhook.processor.ts',
      'analytics.processor.ts',
      'media.processor.ts',
      'search-indexing.processor.ts',
      'ai-tasks.processor.ts',
    ];

    it.each(processors)('%s should have maxStalledCount: 3', (file) => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/processors', file), 'utf8');
      expect(content).toContain('maxStalledCount: 3');
    });
  });

  describe('#121: Sentry DLQ context in failed handlers', () => {
    const processors = [
      'notification.processor.ts',
      'webhook.processor.ts',
      'analytics.processor.ts',
      'media.processor.ts',
      'search-indexing.processor.ts',
      'ai-tasks.processor.ts',
    ];

    it.each(processors)('%s should include extra context in Sentry.captureException', (file) => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/processors', file), 'utf8');
      expect(content).toContain('extra: { jobId:');
      expect(content).toContain('attemptsMade:');
    });
  });

  describe('K04-#11: Sentry only on final attempt', () => {
    const processors = [
      'notification.processor.ts',
      'webhook.processor.ts',
      'analytics.processor.ts',
      'media.processor.ts',
      'search-indexing.processor.ts',
      'ai-tasks.processor.ts',
    ];

    it.each(processors)('%s should guard Sentry with attemptsMade check', (file) => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/processors', file), 'utf8');
      expect(content).toContain('attemptsMade >= maxAttempts');
    });
  });
});

describe('Docker & Deployment Config', () => {
  describe('K05: docker-compose security', () => {
    let content: string;
    beforeAll(() => {
      content = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
    });

    it('should not have deprecated version key', () => {
      expect(content).not.toMatch(/^version:/m);
    });

    it('should bind postgres to localhost', () => {
      expect(content).toContain("127.0.0.1:5432:5432");
    });

    it('should bind redis to localhost', () => {
      expect(content).toContain("127.0.0.1:6379:6379");
    });

    it('should bind meilisearch to localhost', () => {
      expect(content).toContain("127.0.0.1:7700:7700");
    });

    it('should use env var substitution for passwords', () => {
      expect(content).toContain('${POSTGRES_PASSWORD:-mizanly_dev}');
    });
  });

  describe('K05: Dockerfile security', () => {
    it('e2e-server should run as non-root', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/e2e-server/Dockerfile'), 'utf8');
      expect(content).toContain('USER app');
    });

    it('livekit-server should run as non-root', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/livekit-server/Dockerfile'), 'utf8');
      expect(content).toContain('USER app');
    });

    it('e2e-server should have HEALTHCHECK', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/e2e-server/Dockerfile'), 'utf8');
      expect(content).toContain('HEALTHCHECK');
    });

    it('livekit-server should have HEALTHCHECK', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/livekit-server/Dockerfile'), 'utf8');
      expect(content).toContain('HEALTHCHECK');
    });

    it('both Dockerfiles should strip Go binaries', () => {
      const e2e = fs.readFileSync(path.join(ROOT, 'apps/e2e-server/Dockerfile'), 'utf8');
      const livekit = fs.readFileSync(path.join(ROOT, 'apps/livekit-server/Dockerfile'), 'utf8');
      expect(e2e).toContain('-ldflags="-s -w"');
      expect(livekit).toContain('-ldflags="-s -w"');
    });

    it('both Dockerfiles should use Go 1.25', () => {
      const e2e = fs.readFileSync(path.join(ROOT, 'apps/e2e-server/Dockerfile'), 'utf8');
      const livekit = fs.readFileSync(path.join(ROOT, 'apps/livekit-server/Dockerfile'), 'utf8');
      expect(e2e).toContain('golang:1.25-alpine');
      expect(livekit).toContain('golang:1.25-alpine');
    });
  });
});

describe('Coverage Thresholds', () => {
  it('#108: API jest config should have coverage thresholds', () => {
    const content = fs.readFileSync(path.join(ROOT, 'apps/api/jest.config.ts'), 'utf8');
    expect(content).toContain('coverageThreshold');
    expect(content).toContain('branches: 60');
    expect(content).toContain('functions: 60');
    expect(content).toContain('lines: 70');
    expect(content).toContain('statements: 70');
  });
});

describe('CI Pipeline Config', () => {
  let ciContent: string;

  beforeAll(() => {
    ciContent = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  });

  it('should have permissions: contents: read', () => {
    expect(ciContent).toContain('contents: read');
  });

  it('should have concurrency group', () => {
    expect(ciContent).toContain('cancel-in-progress: true');
  });

  it('should have livekit-server job', () => {
    expect(ciContent).toContain('livekit-server:');
  });

  it('should run Signal Protocol tests', () => {
    expect(ciContent).toContain('signal/__tests__/jest.config.js');
  });

  it('should run LiveKit/CallKit tests', () => {
    expect(ciContent).toContain('hooks/__tests__/jest.config.js');
  });

  it('should not trigger on develop branch', () => {
    expect(ciContent).not.toContain('develop');
  });

  it('should have security audit job', () => {
    expect(ciContent).toContain('npm audit');
  });
});
