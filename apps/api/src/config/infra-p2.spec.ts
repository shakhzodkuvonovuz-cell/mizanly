import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('Part 2: Lazy Deferral Fixes', () => {
  describe('Fix 1: google-services.json untracked', () => {
    it('should be in mobile .gitignore', () => {
      const gitignore = fs.readFileSync(path.join(ROOT, 'apps/mobile/.gitignore'), 'utf8');
      expect(gitignore).toContain('google-services.json');
    });
  });

  describe('Fix 2: API .env.example has inter-service vars', () => {
    let envExample: string;
    beforeAll(() => {
      envExample = fs.readFileSync(path.join(ROOT, 'apps/api/.env.example'), 'utf8');
    });

    it('should have INTERNAL_SERVICE_KEY', () => {
      expect(envExample).toContain('INTERNAL_SERVICE_KEY');
    });

    it('should have INTERNAL_WEBHOOK_SECRET', () => {
      expect(envExample).toContain('INTERNAL_WEBHOOK_SECRET');
    });

    it('should have TRANSPARENCY_SIGNING_KEY', () => {
      expect(envExample).toContain('TRANSPARENCY_SIGNING_KEY');
    });

    it('should have CF_IMAGE_RESIZING_ENABLED', () => {
      expect(envExample).toContain('CF_IMAGE_RESIZING_ENABLED');
    });

    it('should NOT have TURN credentials', () => {
      expect(envExample).not.toContain('TURN_USERNAME');
      expect(envExample).not.toContain('TURN_CREDENTIAL');
    });
  });

  describe('Fix 3+4: Go service .env.examples exist', () => {
    it('e2e-server .env.example exists with required vars', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/e2e-server/.env.example'), 'utf8');
      expect(content).toContain('DATABASE_URL');
      expect(content).toContain('CLERK_SECRET_KEY');
      expect(content).toContain('REDIS_URL');
      expect(content).toContain('INTERNAL_WEBHOOK_SECRET');
      expect(content).toContain('TRANSPARENCY_SIGNING_KEY');
    });

    it('livekit-server .env.example exists with required vars', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/livekit-server/.env.example'), 'utf8');
      expect(content).toContain('LIVEKIT_API_KEY');
      expect(content).toContain('LIVEKIT_API_SECRET');
      expect(content).toContain('LIVEKIT_HOST');
      expect(content).toContain('DATABASE_URL');
      expect(content).toContain('INTERNAL_SERVICE_KEY');
    });
  });

  describe('Fix 5: Mobile .env.example synced', () => {
    let content: string;
    beforeAll(() => {
      content = fs.readFileSync(path.join(ROOT, 'apps/mobile/.env.example'), 'utf8');
    });

    it('should have GIPHY key', () => {
      expect(content).toContain('EXPO_PUBLIC_GIPHY_API_KEY');
    });

    it('should have LiveKit URL', () => {
      expect(content).toContain('EXPO_PUBLIC_LIVEKIT_URL');
    });

    it('should have LiveKit WS URL', () => {
      expect(content).toContain('EXPO_PUBLIC_LIVEKIT_WS_URL');
    });
  });

  describe('Fix 8: ESLint flat configs removed', () => {
    it('apps/api/eslint.config.mjs should not exist', () => {
      expect(fs.existsSync(path.join(ROOT, 'apps/api/eslint.config.mjs'))).toBe(false);
    });

    it('apps/mobile/eslint.config.mjs should not exist', () => {
      expect(fs.existsSync(path.join(ROOT, 'apps/mobile/eslint.config.mjs'))).toBe(false);
    });
  });

  describe('Fix 10: Dead notifyScheduledPostsPublished removed', () => {
    it('posts.service.ts should not contain notifyScheduledPostsPublished', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/modules/posts/posts.service.ts'), 'utf8');
      expect(content).not.toContain('notifyScheduledPostsPublished');
    });
  });

  describe('Fix 11: cleanupStaleTokens has cron lock', () => {
    it('devices.service.ts should use acquireCronLock', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/modules/devices/devices.service.ts'), 'utf8');
      expect(content).toContain('acquireCronLock');
      expect(content).toContain("'cron:cleanupStaleTokens'");
    });
  });

  describe('Fix 12: generate-caption removed from ai-tasks processor', () => {
    it('should not contain generate-caption case', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/common/queue/processors/ai-tasks.processor.ts'), 'utf8');
      expect(content).not.toContain('generate-caption');
      expect(content).not.toContain('CaptionJobData');
      expect(content).not.toContain('processCaptionGeneration');
    });
  });

  describe('Fix 14: Docker images pinned to SHA256', () => {
    it('e2e-server Dockerfile should have SHA256 digests', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/e2e-server/Dockerfile'), 'utf8');
      expect(content).toMatch(/golang:1\.25-alpine@sha256:[a-f0-9]{64}/);
      expect(content).toMatch(/alpine:3\.21@sha256:[a-f0-9]{64}/);
    });

    it('livekit-server Dockerfile should have SHA256 digests', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/livekit-server/Dockerfile'), 'utf8');
      expect(content).toMatch(/golang:1\.25-alpine@sha256:[a-f0-9]{64}/);
      expect(content).toMatch(/alpine:3\.21@sha256:[a-f0-9]{64}/);
    });
  });

  describe('Fix 15: Expired story cleanup cron', () => {
    it('stories.service.ts should have cleanupExpiredStories method', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/modules/stories/stories.service.ts'), 'utf8');
      expect(content).toContain('cleanupExpiredStories');
      expect(content).toContain('acquireCronLock');
      expect(content).toContain('isHighlight: false');
      expect(content).toContain('isRemoved: true');
    });
  });

  describe('Fix 16: ConfigModule Joi validation', () => {
    it('app.module.ts should have Joi validation schema', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/app.module.ts'), 'utf8');
      expect(content).toContain('validationSchema');
      expect(content).toContain('Joi.object');
      expect(content).toContain('DATABASE_URL: Joi.string().required()');
      expect(content).toContain('CLERK_SECRET_KEY: Joi.string().required()');
      expect(content).toContain('allowUnknown: true');
    });
  });

  describe('Fix 17: npm cache verified', () => {
    it('all setup-node actions should have cache: npm', () => {
      const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
      const setupNodes = ci.split('setup-node@v4').length - 1;
      const cacheNpm = (ci.match(/cache: npm/g) || []).length;
      expect(cacheNpm).toBe(setupNodes);
    });
  });

  describe('Fix 18: Dev-mode production credential warning', () => {
    it('main.ts should warn about production DB in dev mode', () => {
      const content = fs.readFileSync(path.join(ROOT, 'apps/api/src/main.ts'), 'utf8');
      expect(content).toContain('neon.tech');
      expect(content).toContain('Production database credentials detected');
    });
  });
});
