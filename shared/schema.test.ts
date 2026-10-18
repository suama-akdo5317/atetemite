import { describe, expect, it } from 'vitest';
import {
  DURATION_DEFAULT,
  DurationSchema,
  QUESTION_COUNT_DEFAULT,
  QuestionCountSchema,
} from './schema';

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

describe('QuestionCountSchema', () => {
  it.each(['1', '8', '50'])('accepts %s', (input) => {
    expect(QuestionCountSchema.parse(input)).toBe(Number(input));
  });

  it.each(['0', '51', '2.5', '', 'abc'])('rejects %j', (input) => {
    expect(QuestionCountSchema.safeParse(input).success).toBe(false);
  });

  it('defaults to 8', () => {
    expect(QUESTION_COUNT_DEFAULT).toBe(8);
  });
});
