import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../shared/database.types';
import { type Category, CategorySchema, type Topic, TopicSchema } from '../../shared/schema';

let client: SupabaseClient<Database> | undefined;

function getClient(): SupabaseClient<Database> {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase の接続設定がありません');
  // '/supabase' のような相対パスも受け付ける（実機確認でトンネル経由のプロキシを使うとき）
  const absoluteUrl = new URL(url, window.location.origin).toString().replace(/\/$/, '');
  client = createClient<Database>(absoluteUrl, key, { auth: { persistSession: false } });
  return client;
}

/** 公開中のカテゴリ（RLS で公開分だけに絞られる） */
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await getClient()
    .from('categories')
    .select('id, name')
    .order('sort_order');
  if (error) throw error;
  return z.array(CategorySchema).parse(data);
}

export async function fetchTopics(categoryId: number): Promise<Topic[]> {
  const { data, error } = await getClient()
    .from('topics')
    .select('id, text')
    .eq('category_id', categoryId);
  if (error) throw error;
  return z.array(TopicSchema).parse(data);
}
