import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IdentityChangeDto } from './identity-change.dto';

describe('IdentityChangeDto', () => {
  it('validates a correct payload', async () => {
    const dto = plainToInstance(IdentityChangeDto, {
      userId: 'user-123',
      newFingerprint: 'abc123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts optional oldFingerprint', async () => {
    const dto = plainToInstance(IdentityChangeDto, {
      userId: 'user-123',
      oldFingerprint: 'old-fp',
      newFingerprint: 'new-fp',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects missing userId', async () => {
    const dto = plainToInstance(IdentityChangeDto, {
      newFingerprint: 'abc123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('userId');
  });

  it('rejects missing newFingerprint', async () => {
    const dto = plainToInstance(IdentityChangeDto, {
      userId: 'user-123',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'newFingerprint')).toBe(true);
  });

  it('rejects non-string userId', async () => {
    const dto = plainToInstance(IdentityChangeDto, {
      userId: 123,
      newFingerprint: 'abc',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
