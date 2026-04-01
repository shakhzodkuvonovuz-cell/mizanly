import { formatTime } from '../formatTime';

describe('formatTime', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats 59 seconds as 00:59', () => {
    expect(formatTime(59)).toBe('00:59');
  });

  it('formats 60 seconds as 01:00', () => {
    expect(formatTime(60)).toBe('01:00');
  });

  it('formats 90 seconds as 01:30', () => {
    expect(formatTime(90)).toBe('01:30');
  });

  it('formats 3661 seconds as 61:01 (no hour separator)', () => {
    expect(formatTime(3661)).toBe('61:01');
  });

  it('pads single-digit minutes', () => {
    expect(formatTime(5)).toBe('00:05');
  });

  it('handles fractional seconds by flooring', () => {
    expect(formatTime(65.9)).toBe('01:05');
  });

  it('handles negative seconds by using absolute value', () => {
    expect(formatTime(-30)).toBe('00:30');
  });
});
