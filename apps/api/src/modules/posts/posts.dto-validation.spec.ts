import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePostDto } from './dto/create-post.dto';

/**
 * DTO validation tests — verify class-validator decorators catch bad input.
 * These test the validation layer BEFORE the service even sees the data.
 */
describe('CreatePostDto — Validation', () => {

  function makeDto(overrides: Record<string, unknown> = {}): CreatePostDto {
    return plainToInstance(CreatePostDto, {
      postType: 'TEXT',
      content: 'Hello world',
      ...overrides,
    });
  }

  // ── postType ──

  it('should accept valid postType: TEXT', async () => {
    const errors = await validate(makeDto({ postType: 'TEXT' }));
    const postTypeErrors = errors.filter(e => e.property === 'postType');
    expect(postTypeErrors).toHaveLength(0);
  });

  it('should accept valid postType: CAROUSEL', async () => {
    const errors = await validate(makeDto({ postType: 'CAROUSEL' }));
    const postTypeErrors = errors.filter(e => e.property === 'postType');
    expect(postTypeErrors).toHaveLength(0);
  });

  it('should reject invalid postType', async () => {
    const errors = await validate(makeDto({ postType: 'INVALID' }));
    const postTypeErrors = errors.filter(e => e.property === 'postType');
    expect(postTypeErrors.length).toBeGreaterThan(0);
  });

  // ── content ──

  it('should accept content within 2000 chars', async () => {
    const errors = await validate(makeDto({ content: 'a'.repeat(2000) }));
    const contentErrors = errors.filter(e => e.property === 'content');
    expect(contentErrors).toHaveLength(0);
  });

  it('should reject content over 2000 chars', async () => {
    const errors = await validate(makeDto({ content: 'a'.repeat(2001) }));
    const contentErrors = errors.filter(e => e.property === 'content');
    expect(contentErrors.length).toBeGreaterThan(0);
  });

  // ── commentPermission ──

  it('should accept commentPermission: EVERYONE', async () => {
    const errors = await validate(makeDto({ commentPermission: 'EVERYONE' }));
    const permErrors = errors.filter(e => e.property === 'commentPermission');
    expect(permErrors).toHaveLength(0);
  });

  it('should accept commentPermission: FOLLOWERS', async () => {
    const errors = await validate(makeDto({ commentPermission: 'FOLLOWERS' }));
    const permErrors = errors.filter(e => e.property === 'commentPermission');
    expect(permErrors).toHaveLength(0);
  });

  it('should accept commentPermission: NOBODY', async () => {
    const errors = await validate(makeDto({ commentPermission: 'NOBODY' }));
    const permErrors = errors.filter(e => e.property === 'commentPermission');
    expect(permErrors).toHaveLength(0);
  });

  it('should reject commentPermission: INVALID_VALUE', async () => {
    const errors = await validate(makeDto({ commentPermission: 'INVALID_VALUE' }));
    const permErrors = errors.filter(e => e.property === 'commentPermission');
    expect(permErrors.length).toBeGreaterThan(0);
  });

  // ── taggedUserIds ──

  it('should accept array of strings for taggedUserIds', async () => {
    const errors = await validate(makeDto({ taggedUserIds: ['user-1', 'user-2'] }));
    const tagErrors = errors.filter(e => e.property === 'taggedUserIds');
    expect(tagErrors).toHaveLength(0);
  });

  it('should reject taggedUserIds with > 20 items', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `user-${i}`);
    const errors = await validate(makeDto({ taggedUserIds: ids }));
    const tagErrors = errors.filter(e => e.property === 'taggedUserIds');
    expect(tagErrors.length).toBeGreaterThan(0);
  });

  // ── topics ──

  it('should accept topics with 1-3 items', async () => {
    const errors = await validate(makeDto({ topics: ['islamic', 'tech'] }));
    const topicErrors = errors.filter(e => e.property === 'topics');
    expect(topicErrors).toHaveLength(0);
  });

  it('should reject topics with > 3 items', async () => {
    const errors = await validate(makeDto({ topics: ['a', 'b', 'c', 'd'] }));
    const topicErrors = errors.filter(e => e.property === 'topics');
    expect(topicErrors.length).toBeGreaterThan(0);
  });

  // ── scheduledAt ──

  it('should accept valid ISO 8601 scheduledAt', async () => {
    const errors = await validate(makeDto({ scheduledAt: '2026-04-01T10:00:00.000Z' }));
    const schedErrors = errors.filter(e => e.property === 'scheduledAt');
    expect(schedErrors).toHaveLength(0);
  });

  it('should reject invalid scheduledAt string', async () => {
    const errors = await validate(makeDto({ scheduledAt: 'not-a-date' }));
    const schedErrors = errors.filter(e => e.property === 'scheduledAt');
    expect(schedErrors.length).toBeGreaterThan(0);
  });

  it('should reject scheduledAt as random text', async () => {
    const errors = await validate(makeDto({ scheduledAt: 'banana' }));
    const schedErrors = errors.filter(e => e.property === 'scheduledAt');
    expect(schedErrors.length).toBeGreaterThan(0);
  });

  it('should accept missing scheduledAt (optional)', async () => {
    const errors = await validate(makeDto({}));
    const schedErrors = errors.filter(e => e.property === 'scheduledAt');
    expect(schedErrors).toHaveLength(0);
  });

  // ── locationName ──

  it('should accept locationName within 200 chars', async () => {
    const errors = await validate(makeDto({ locationName: 'Sydney, Australia' }));
    const locErrors = errors.filter(e => e.property === 'locationName');
    expect(locErrors).toHaveLength(0);
  });

  it('should reject locationName over 200 chars', async () => {
    const errors = await validate(makeDto({ locationName: 'x'.repeat(201) }));
    const locErrors = errors.filter(e => e.property === 'locationName');
    expect(locErrors.length).toBeGreaterThan(0);
  });

  // ── locationLat / locationLng ──

  it('should accept valid coordinates', async () => {
    const errors = await validate(makeDto({ locationLat: -33.8688, locationLng: 151.2093 }));
    const latErrors = errors.filter(e => e.property === 'locationLat');
    const lngErrors = errors.filter(e => e.property === 'locationLng');
    expect(latErrors).toHaveLength(0);
    expect(lngErrors).toHaveLength(0);
  });

  it('should reject latitude > 90', async () => {
    const errors = await validate(makeDto({ locationLat: 91 }));
    const latErrors = errors.filter(e => e.property === 'locationLat');
    expect(latErrors.length).toBeGreaterThan(0);
  });

  it('should reject longitude < -180', async () => {
    const errors = await validate(makeDto({ locationLng: -181 }));
    const lngErrors = errors.filter(e => e.property === 'locationLng');
    expect(lngErrors.length).toBeGreaterThan(0);
  });

  // ── brandPartner ──

  it('should accept brandPartner within 100 chars', async () => {
    const errors = await validate(makeDto({ brandPartner: 'Nike' }));
    const bpErrors = errors.filter(e => e.property === 'brandPartner');
    expect(bpErrors).toHaveLength(0);
  });

  it('should reject brandPartner over 100 chars', async () => {
    const errors = await validate(makeDto({ brandPartner: 'x'.repeat(101) }));
    const bpErrors = errors.filter(e => e.property === 'brandPartner');
    expect(bpErrors.length).toBeGreaterThan(0);
  });

  // ── altText ──

  it('should accept altText within 1000 chars', async () => {
    const errors = await validate(makeDto({ altText: 'A beautiful sunset' }));
    const atErrors = errors.filter(e => e.property === 'altText');
    expect(atErrors).toHaveLength(0);
  });

  it('should reject altText over 1000 chars', async () => {
    const errors = await validate(makeDto({ altText: 'x'.repeat(1001) }));
    const atErrors = errors.filter(e => e.property === 'altText');
    expect(atErrors.length).toBeGreaterThan(0);
  });

  // ── collaboratorUsername ──

  it('should accept collaboratorUsername within 50 chars', async () => {
    const errors = await validate(makeDto({ collaboratorUsername: 'john_doe' }));
    const cuErrors = errors.filter(e => e.property === 'collaboratorUsername');
    expect(cuErrors).toHaveLength(0);
  });

  it('should reject collaboratorUsername over 50 chars', async () => {
    const errors = await validate(makeDto({ collaboratorUsername: 'x'.repeat(51) }));
    const cuErrors = errors.filter(e => e.property === 'collaboratorUsername');
    expect(cuErrors.length).toBeGreaterThan(0);
  });

  // ── visibility ──

  it('should reject invalid visibility', async () => {
    const errors = await validate(makeDto({ visibility: 'PRIVATE' }));
    const visErrors = errors.filter(e => e.property === 'visibility');
    expect(visErrors.length).toBeGreaterThan(0);
  });

  // ── mediaUrls ──

  it('should reject mediaUrls with > 10 items', async () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}.jpg`);
    const errors = await validate(makeDto({ mediaUrls: urls }));
    const mediaErrors = errors.filter(e => e.property === 'mediaUrls');
    expect(mediaErrors.length).toBeGreaterThan(0);
  });

  it('should reject mediaUrls with non-URL strings', async () => {
    const errors = await validate(makeDto({ mediaUrls: ['not-a-url'] }));
    const mediaErrors = errors.filter(e => e.property === 'mediaUrls');
    expect(mediaErrors.length).toBeGreaterThan(0);
  });
});
