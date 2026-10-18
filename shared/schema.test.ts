import { describe, expect, it } from 'vitest';
import { DURATION_DEFAULT, DurationSchema } from './schema';

describe('DurationSchema', () => {
  it.each(['10', '60', '300'])('accepts %s', (input) => {
    expect(DurationSchema.parse(input)).toBe(Number(input));
  });

  it.each(['9', '301', '60.5', '', 'abc', '-10'])('rejects %j', (input) => {
    expect(DurationSchema.safeParse(input).success).toBe(false);
  });

  it('default is within range', () => {
    expect(DurationSchema.parse(String(DURATION_DEFAULT))).toBe(60);
  });
});
