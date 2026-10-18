import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../shared/database.types';
import {
  type CategorySummary,
  formatSummary,
  listPublishedSlugs,
  parseArgs,
  runCategory,
  type TopicGenerator,
} from './run';

const EnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1).default('claude-haiku-5-5'),
});

const TopicsOutput = z.object({ topics: z.array(z.string()) });

function anthropicGenerator(client: Anthropic, model: string): TopicGenerator {
  return async (system, prompt) => {
    const message = await client.messages.parse({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: zodOutputFormat(TopicsOutput) },
    });
    if (!message.parsed_output) {
      throw new Error(`LLM の出力を解析できませんでした (stop_reason: ${message.stop_reason})`);
    }
    return message.parsed_output.topics;
  };
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const envResult = EnvSchema.safeParse(process.env);
  if (!envResult.success) {
    console.error(`環境変数が不足しています:\n${z.prettifyError(envResult.error)}`);
    return 1;
  }
  const env = envResult.data;
  const db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
  const generate = anthropicGenerator(
    new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
    env.LLM_MODEL,
  );
  const deps = { db, generate, model: env.LLM_MODEL };

  const slugs = opts.category ? [opts.category] : await listPublishedSlugs(db);
  const summaries: CategorySummary[] = [];
  for (const slug of slugs) {
    const summary = await runCategory(deps, slug, opts);
    console.log(formatSummary(summary));
    if (opts.dryRun && summary.accepted.length > 0) console.log(`  ${summary.accepted.join(', ')}`);
    summaries.push(summary);
  }
  return summaries.some((s) => s.status === 'failed') ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
