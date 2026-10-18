import { describe, expect, it } from 'vitest';
import { normalizeTopic } from './normalize';
import { validateTopics } from './validate';

describe('normalizeTopic', () => {
  it.each([
    ['キリン', 'きりん'],
    ['ｷﾘﾝ', 'きりん'], // 半角カナ
    ['ＡＢＣ', 'abc'], // 全角英字
    ['  アイス クリーム  ', 'あいすくりーむ'], // 空白はすべて除く
    ['ヴァイオリン', 'ゔぁいおりん'],
    ['Tシャツ', 'tしゃつ'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeTopic(input)).toBe(expected);
  });
});

describe('validateTopics', () => {
  const none = new Set<string>();

  it('accepts valid topics and keeps the trimmed original text', () => {
    const r = validateTopics([' キリン ', 'ゾウ'], none, []);
    expect(r.accepted).toEqual([
      { text: 'キリン', text_normalized: 'きりん' },
      { text: 'ゾウ', text_normalized: 'ぞう' },
    ]);
    expect(r.rejected).toEqual({ empty: 0, tooLong: 0, ng: 0, duplicate: 0 });
  });

  it('rejects empty and whitespace-only strings', () => {
    expect(validateTopics(['', '   ', '　'], none, []).rejected.empty).toBe(3);
  });

  it('allows 20 characters and rejects 21 (counted as code points)', () => {
    const r = validateTopics(['あ'.repeat(20), 'い'.repeat(21), '🐘'.repeat(20)], none, []);
    expect(r.accepted.map((a) => a.text)).toEqual(['あ'.repeat(20), '🐘'.repeat(20)]);
    expect(r.rejected.tooLong).toBe(1);
  });

  it('rejects topics containing NG words after normalization', () => {
    const r = validateTopics(['ﾊﾞｶ殿', 'ばかうけ', 'ゾウ'], none, ['バカ']);
    expect(r.accepted.map((a) => a.text)).toEqual(['ゾウ']);
    expect(r.rejected.ng).toBe(2);
  });

  it('rejects duplicates within the batch and against existing topics', () => {
    const existing = new Set(['ぞう']);
    const r = validateTopics(['キリン', 'きりん', 'ｷﾘﾝ', 'ゾウ'], existing, []);
    expect(r.accepted.map((a) => a.text)).toEqual(['キリン']);
    expect(r.rejected.duplicate).toBe(3);
  });

  it('does not mutate the existing set', () => {
    const existing = new Set(['ぞう']);
    validateTopics(['キリン'], existing, []);
    expect([...existing]).toEqual(['ぞう']);
  });
});
