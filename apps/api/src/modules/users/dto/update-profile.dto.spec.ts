import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  const toDto = (data: Record<string, unknown>) =>
    plainToInstance(UpdateProfileDto, data);

  it('should accept valid madhab values', async () => {
    for (const madhab of ['hanafi', 'maliki', 'shafii', 'hanbali']) {
      const dto = toDto({ madhab });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('should reject invalid madhab values', async () => {
    const dto = toDto({ madhab: 'invalid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept empty dto (all optional)', async () => {
    const dto = toDto({});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid theme values', async () => {
    for (const theme of ['dark', 'light', 'system']) {
      const dto = toDto({ theme });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('should reject invalid theme values', async () => {
    const dto = toDto({ theme: 'blue' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject displayName over 50 chars', async () => {
    const dto = toDto({ displayName: 'a'.repeat(51) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject bio over 160 chars', async () => {
    const dto = toDto({ bio: 'a'.repeat(161) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject invalid avatarUrl', async () => {
    const dto = toDto({ avatarUrl: 'not-a-url' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid complete profile update', async () => {
    const dto = toDto({
      displayName: 'Test User',
      bio: 'Hello',
      location: 'Sydney',
      language: 'en',
      theme: 'dark',
      isPrivate: false,
      madhab: 'hanafi',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject location over 100 chars', async () => {
    const dto = toDto({ location: 'a'.repeat(101) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-boolean isPrivate', async () => {
    const dto = toDto({ isPrivate: 'yes' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
