import { parseArgs as parseNodeArgs } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../shared/database.types';
import { NG_WORDS } from './ng-words';
import { buildPrompt, SYSTEM_PROMPT } from './prompt';
import { type RejectReason, validateTopics } from './validate';

export const MAX_TOPICS_PER_CATEGORY = 500;
const COUNT_DEFAULT = 30;
const COUNT_MAX = 100;

export type TopicGenerator = (system: string, prompt: string) => Promise<string[]>;
export type CliOptions = { category?: string; all: boolean; count: number; dryRun: boolean };
export type RunDeps = {
  db: SupabaseClient<Database>;
  generate: TopicGenerator;
  model: string;
  maxTopics?: number;
};
export type CategorySummary = {
  slug: string;
  status: 'ok' | 'skipped' | 'failed';
  generated: number;
  inserted: number;
  rejected: Record<RejectReason, number>;
  accepted: string[];
  error?: string;
};

export function parseArgs(argv: readonly string[]): CliOptions {
  const { values } = parseNodeArgs({
    args: [...argv],
    options: {
      category: { type: 'string' },
      all: { type: 'boolean', default: false },
      count: { type: 'string', default: String(COUNT_DEFAULT) },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (Boolean(values.category) === values.all) {
    throw new Error('--category <slug> か --all のどちらか一方を指定してください');
  }
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > COUNT_MAX) {
    throw new Error(`--count は 1〜${COUNT_MAX} の整数で指定してください`);
  }
  return { category: values.category, all: values.all, count, dryRun: values['dry-run'] };
}

const emptySummary = (slug: string): CategorySummary => ({
  slug,
  status: 'ok',
  generated: 0,
  inserted: 0,
  rejected: { empty: 0, tooLong: 0, ng: 0, duplicate: 0 },
  accepted: [],
});

/** 1カテゴリ分を生成・検証・保存する。例外は投げず、失敗は status で返す（FR-23） */
export async function runCategory(
  deps: RunDeps,
  slug: string,
  opts: Pick<CliOptions, 'count' | 'dryRun'>,
): Promise<CategorySummary> {
  const summary = emptySummary(slug);
  try {
    return await generateForCategory(deps, slug, opts, summary);
  } catch (e) {
    return { ...summary, status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

async function generateForCategory(
  { db, generate, model, maxTopics = MAX_TOPICS_PER_CATEGORY }: RunDeps,
  slug: string,
  { count, dryRun }: Pick<CliOptions, 'count' | 'dryRun'>,
  summary: CategorySummary,
): Promise<CategorySummary> {
  const { data: category } = await db
    .from('categories')
    .select('id, name')
    .eq('slug', slug)
    .single()
    .throwOnError();
  // 非公開のお題も含めて取得し、同じお題を作り直さないようにする
  const { data: existing } = await db
    .from('topics')
    .select('text, text_normalized')
    .eq('category_id', category.id)
    .throwOnError();

  const capacity = maxTopics - existing.length;
  if (capacity <= 0) return { ...summary, status: 'skipped' };

  const generated = await generate(
    SYSTEM_PROMPT,
    buildPrompt(
      category.name,
      existing.map((t) => t.text),
      Math.min(count, capacity),
    ),
  );
  const { accepted, rejected } = validateTopics(
    generated,
    new Set(existing.map((t) => t.text_normalized)),
    NG_WORDS,
  );
  const toSave = accepted.slice(0, capacity);
  const result = {
    ...summary,
    generated: generated.length,
    rejected,
    accepted: toSave.map((t) => t.text),
  };
  if (dryRun || toSave.length === 0) return result;

  const { data: inserted } = await db
    .from('topics')
    .upsert(
      toSave.map((t) => ({
        ...t,
        category_id: category.id,
        generated_by: model,
        is_published: true,
      })),
      { onConflict: 'category_id,text_normalized', ignoreDuplicates: true },
    )
    .select('id')
    .throwOnError();
  return { ...result, inserted: inserted.length };
}

export async function listPublishedSlugs(db: SupabaseClient<Database>): Promise<string[]> {
  const { data } = await db
    .from('categories')
    .select('slug')
    .eq('is_published', true)
    .order('sort_order')
    .throwOnError();
  return data.map((c) => c.slug);
}

export function formatSummary(s: CategorySummary): string {
  if (s.status === 'skipped') return `${s.slug}: スキップ（上限に達しています）`;
  if (s.status === 'failed') return `${s.slug}: 失敗 - ${s.error}`;
  const r = s.rejected;
  const rejectedTotal = r.empty + r.tooLong + r.ng + r.duplicate;
  return `${s.slug}: 生成 ${s.generated} / 不採用 ${rejectedTotal} (重複 ${r.duplicate}, NG ${r.ng}, 長すぎ ${r.tooLong}, 空 ${r.empty}) / 保存 ${s.inserted}`;
}
