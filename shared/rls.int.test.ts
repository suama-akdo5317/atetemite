import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from './database.types';

const url = process.env.SUPABASE_URL ?? '';
const anon = createClient<Database>(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '');
const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY ?? '', {
  auth: { persistSession: false },
});

const MARK = 'test-rls';
let categoryId = 0;

beforeAll(async () => {
  const { data: category } = await admin
    .from('categories')
    .select('id')
    .eq('slug', 'animals')
    .single()
    .throwOnError();
  categoryId = category.id;
  await admin
    .from('topics')
    .insert([
      {
        category_id: categoryId,
        text: 'RLS公開',
        text_normalized: 'rls公開',
        generated_by: MARK,
        is_published: true,
      },
      {
        category_id: categoryId,
        text: 'RLS非公開',
        text_normalized: 'rls非公開',
        generated_by: MARK,
        is_published: false,
      },
    ])
    .throwOnError();
});

afterAll(async () => {
  await admin.from('topics').delete().eq('generated_by', MARK).throwOnError();
  await admin.from('categories').update({ is_published: true }).eq('slug', 'foods');
});

describe('RLS (NFR-05)', () => {
  it('anon reads only published topics', async () => {
    const { data, error } = await anon.from('topics').select('text').eq('generated_by', MARK);
    expect(error).toBeNull();
    expect(data?.map((t) => t.text)).toEqual(['RLS公開']);
  });

  it('anon reads only published categories', async () => {
    await admin.from('categories').update({ is_published: false }).eq('slug', 'foods');
    const { data } = await anon.from('categories').select('slug');
    expect(data?.map((c) => c.slug)).not.toContain('foods');
    expect(data?.map((c) => c.slug)).toContain('animals');
  });

  it('anon cannot insert topics', async () => {
    const { error } = await anon.from('topics').insert({
      category_id: categoryId,
      text: '侵入',
      text_normalized: '侵入',
      generated_by: MARK,
    });
    expect(error?.code).toBe('42501');
  });

  it('anon cannot update or delete topics', async () => {
    const upd = await anon.from('topics').update({ text: '改ざん' }).eq('generated_by', MARK);
    expect(upd.error?.code).toBe('42501');
    const del = await anon.from('topics').delete().eq('generated_by', MARK);
    expect(del.error?.code).toBe('42501');
  });

  it('anon cannot insert categories', async () => {
    const { error } = await anon.from('categories').insert({ slug: 'evil', name: '悪' });
    expect(error?.code).toBe('42501');
  });

  it('db rejects topics longer than 20 chars', async () => {
    const { error } = await admin.from('topics').insert({
      category_id: categoryId,
      text: 'あ'.repeat(21),
      text_normalized: 'あ'.repeat(21),
      generated_by: MARK,
    });
    expect(error?.code).toBe('23514');
  });
});
