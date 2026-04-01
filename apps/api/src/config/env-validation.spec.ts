import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('Environment Validation Rules', () => {
  describe('Required env vars', () => {
    it('DATABASE_URL must be present in required list', () => {
      const mainTs = fs.readFileSync(path.join(ROOT, 'apps/api/src/main.ts'), 'utf8');
      expect(mainTs).toContain("['DATABASE_URL'");
    });

    it('CLERK_SECRET_KEY must be present in required list', () => {
      const mainTs = fs.readFileSync(path.join(ROOT, 'apps/api/src/main.ts'), 'utf8');
      expect(mainTs).toContain("'CLERK_SECRET_KEY'");
    });
  });

  describe('Production-required env vars', () => {
    let mainTs: string;
    beforeAll(() => {
      mainTs = fs.readFileSync(path.join(ROOT, 'apps/api/src/main.ts'), 'utf8');
    });

    const prodRequired = [
      'REDIS_URL',
      'TOTP_ENCRYPTION_KEY',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ];

    it.each(prodRequired)('%s should be in requiredInProd list', (key) => {
      expect(mainTs).toContain(`'${key}'`);
    });
  });

  describe('Test key detection', () => {
    it('should detect Clerk test keys', () => {
      expect('sk_test_abc123'.includes('_test_')).toBe(true);
    });

    it('should not flag live keys', () => {
      expect('sk_live_abc123'.includes('_test_')).toBe(false);
    });

    it('should detect Stripe test keys', () => {
      expect('sk_test_51TCJjs'.includes('_test_')).toBe(true);
    });

    it('main.ts should check for _test_ in production', () => {
      const mainTs = fs.readFileSync(path.join(ROOT, 'apps/api/src/main.ts'), 'utf8');
      expect(mainTs).toContain("includes('_test_')");
    });
  });

  describe('Railway config safety', () => {
    let railwayConfig: Record<string, any>;

    beforeAll(() => {
      railwayConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/api/railway.json'), 'utf8'));
    });

    it('should use prisma migrate deploy instead of db push', () => {
      expect(railwayConfig.build.buildCommand).toContain('prisma migrate deploy');
      expect(railwayConfig.build.buildCommand).not.toContain('--accept-data-loss');
    });

    it('should use npm ci instead of npm install', () => {
      expect(railwayConfig.build.installCommand).toContain('npm ci');
    });

    it('should have healthcheckTimeout configured', () => {
      expect(railwayConfig.deploy.healthcheckTimeout).toBeDefined();
      expect(railwayConfig.deploy.healthcheckTimeout).toBeLessThanOrEqual(60);
    });

    it('should have reasonable restart retry count', () => {
      expect(railwayConfig.deploy.restartPolicyMaxRetries).toBeLessThanOrEqual(5);
    });
  });
});
