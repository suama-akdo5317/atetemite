import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../shared/database.types';
import { runCategory, type TopicGenerator } from './run';

const db = createClient<Database>(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SECRET_KEY ?? '',
  { auth: { persistSession: false } },
);
const MODEL = 'test-model';
const fake =
  (topics: string[], calls: string[] = []): TopicGenerator =>
  async (_system, prompt) => {
    calls.push(prompt);
    return topics;
  };
const deps = (generate: TopicGenerator, maxTopics = 500) => ({
  db,
  generate,
  model: MODEL,
  maxTopics,
});
const opts = { count: 5, dryRun: false };

const storedTexts = async () => {
  const { data } = await db
    .from('topics')
    .select('text')
    .eq('generated_by', MODEL)
    .order('id')
    .throwOnError();
  return data.map((t) => t.text);
};

// seed のお題に影響されないよう、専用カテゴリを作って使う
const SLUG = 'test-batch';

beforeAll(async () => {
  await db.from('categories').delete().eq('slug', SLUG).throwOnError();
  await db.from('categories').insert({ slug: SLUG, name: 'テスト' }).throwOnError();
});
afterEach(async () => {
  await db.from('topics').delete().eq('generated_by', MODEL).throwOnError();
});
afterAll(async () => {
  await db.from('categories').delete().eq('slug', SLUG).throwOnError();
});

describe('runCategory', () => {
  it('saves validated topics', async () => {
    const r = await runCategory(deps(fake(['キリン', 'ゾウ', 'きりん', ''])), SLUG, opts);
    expect(r).toMatchObject({ slug: SLUG, status: 'ok', generated: 4, inserted: 2 });
    expect(r.rejected).toEqual({ empty: 1, tooLong: 0, ng: 0, duplicate: 1 });
    expect(await storedTexts()).toEqual(['キリン', 'ゾウ']);
  });

  it('does not duplicate on re-run and passes existing topics to the prompt', async () => {
    await runCategory(deps(fake(['キリン'])), SLUG, opts);
    const calls: string[] = [];
    const r = await runCategory(deps(fake(['キリン', 'ライオン'], calls)), SLUG, opts);
    expect(r).toMatchObject({ inserted: 1, rejected: { duplicate: 1 } });
    expect(calls[0]).toContain('キリン');
    expect(await storedTexts()).toEqual(['キリン', 'ライオン']);
  });

  it('does not write on dry run', async () => {
    const r = await runCategory(deps(fake(['キリン'])), SLUG, { count: 5, dryRun: true });
    expect(r).toMatchObject({ status: 'ok', inserted: 0, accepted: ['キリン'] });
    expect(await storedTexts()).toEqual([]);
  });

  it('caps by remaining capacity and skips a full category', async () => {
    const r = await runCategory(deps(fake(['キリン', 'ゾウ', 'ライオン']), 2), SLUG, opts);
    expect(r.inserted).toBe(2);
    const skipped = await runCategory(deps(fake(['トラ']), 2), SLUG, opts);
    expect(skipped.status).toBe('skipped');
  });

  it('reports failure when the generator throws', async () => {
    const failing: TopicGenerator = async () => {
      throw new Error('LLM down');
    };
    const r = await runCategory(deps(failing), SLUG, opts);
    expect(r).toMatchObject({ status: 'failed', error: 'LLM down' });
  });

  it('reports failure for an unknown category', async () => {
    const r = await runCategory(deps(fake(['キリン'])), 'no-such-category', opts);
    expect(r.status).toBe('failed');
  });
});
