import { describe, expect, it } from 'vitest';
import { shuffle } from './deck';

describe('shuffle', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];

  it('keeps every element exactly once', () => {
    expect([...shuffle(items)].sort((a, b) => a - b)).toEqual(items);
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    shuffle(items);
    expect(items).toEqual(copy);
  });

  it('is deterministic for a fixed random source', () => {
    const fixed = () => 0;
    expect(shuffle(items, fixed)).toEqual(shuffle(items, fixed));
    expect(shuffle(items, fixed)).not.toEqual(items);
  });

  it('handles empty input', () => {
    expect(shuffle([])).toEqual([]);
  });
});
