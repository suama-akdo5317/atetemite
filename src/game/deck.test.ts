import { describe, expect, it } from 'vitest';
import { drawDeck, shuffle } from './deck';

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

describe('drawDeck', () => {
  const pool = [1, 2, 3, 4, 5];

  it('draws the requested number of distinct items from the pool', () => {
    const deck = drawDeck(pool, 3);
    expect(deck).toHaveLength(3);
    expect(new Set(deck).size).toBe(3);
    for (const item of deck) expect(pool).toContain(item);
  });

  it('returns everything when the pool is smaller than the count', () => {
    expect([...drawDeck(pool, 8)].sort()).toEqual(pool);
  });

  it('does not mutate the pool', () => {
    drawDeck(pool, 2);
    expect(pool).toEqual([1, 2, 3, 4, 5]);
  });
});
