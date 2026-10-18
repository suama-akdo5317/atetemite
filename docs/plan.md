# あててミテ！ 実装計画

- 仕様: [requirements.md](./requirements.md) / [design.md](./design.md)
- 進め方: タスクごとにテストを先に書く（RED → GREEN → リファクタ）。コミットはユーザーの指示があるまでしない。
- 実行: このセッションで順に実装する。誤りが見つかったら設計書を先に直し、それから実装を直す。

## 共通の制約

- パッケージ管理と実行は Bun（`.mise.toml` で bun を指定）
- 制限時間: 10〜300 の整数、初期値 60
- お題: 1〜20 文字。1カテゴリの上限は 500 件。生成数の初期値は 30
- 傾き: `TRIGGER_DEG = 45`、`NEUTRAL_DEG = 25`
- LLM: `LLM_MODEL` の初期値は `claude-haiku-5-5`
- クライアントに置いてよい環境変数は `VITE_` で始まるものだけ

## 進捗（2026-10-17）

- タスク1〜9: 完了。単体テスト 69 件、結合テスト 12 件、E2E 5 件がすべて通過。ロジックのカバレッジは行 93%、分岐 91%
- タスク10（実機確認）: 未着手。Supabase の本番プロジェクトと Vercel の設定が必要
- バッチの実際の LLM 呼び出し: 未確認（`LLM_API_KEY` が必要）

## タスク一覧

| # | タスク | 成果物 | 確認方法 |
|---|---|---|---|
| 1 | 土台づくり | Vite + React 19 + TS、Tailwind v4、React Compiler、Biome、Vitest | `bun run lint` / `bun run test` / `bun run build` が通る |
| 2 | 共通スキーマとシャッフル | `shared/schema.ts`、`src/game/deck.ts` | 単体テスト |
| 3 | ステートマシン | `src/game/machine.ts` | 単体テスト（遷移表の全行） |
| 4 | 傾き判定 | `src/game/tilt.ts` | 単体テスト |
| 5 | DB | `supabase/migrations/*`、`supabase/seed.sql` | 結合テスト（RLS） |
| 6 | お題の検証 | `batch/normalize.ts`、`batch/validate.ts`、`batch/ng-words.ts` | 単体テスト |
| 7 | バッチ CLI | `batch/prompt.ts`、`batch/generate.ts` | 結合テスト（フェイクの LLM ＋ローカル DB） |
| 8 | 画面と副作用 | `src/lib/*`、`src/screens/*`、`src/App.tsx` | ブラウザで目視確認 |
| 9 | E2E | `e2e/*.spec.ts` | Playwright |
| 10 | 実機確認 | Vercel プレビュー | 設計書 6.4 のチェックリスト（ユーザーが実施） |

## インターフェース（タスク間の約束）

### タスク2: `shared/schema.ts`、`src/game/deck.ts`

```ts
export const CategorySchema: z.ZodObject<{ id: number; name: string }>;
export const TopicSchema:    z.ZodObject<{ id: number; text: string }>;
export type Category = z.infer<typeof CategorySchema>;
export type Topic = z.infer<typeof TopicSchema>;
export const DURATION_MIN = 10, DURATION_MAX = 300, DURATION_DEFAULT = 60;
export const DurationSchema; // 入力欄の文字列 → 整数。範囲外・小数・空文字は失敗

export function shuffle<T>(items: readonly T[], random?: () => number): T[]; // 新しい配列を返す
```

テスト: シャッフル後も要素が欠けたり増えたりしない。元の配列を変更しない。`random` を固定すると結果が決まる。`DurationSchema` は "10"・"300" を通し、"9"・"301"・"60.5"・"" を通さない。

### タスク3: `src/game/machine.ts`

```ts
export type InputMode = 'tilt' | 'tap';
export type Outcome = 'correct' | 'pass';
export type Answer = { topic: Topic; outcome: Outcome };
export type GameState = /* 設計書 3.1 のとおり */;
export type GameEvent =
  | { type: 'START'; deck: Topic[]; durationSec: number; inputMode: InputMode }
  | { type: 'COUNTDOWN_DONE'; now: number }
  | { type: 'ANSWER'; outcome: Outcome }
  | { type: 'NEXT' }
  | { type: 'TIME_UP' }
  | { type: 'FALLBACK_TO_TAP' }
  | { type: 'RETRY'; deck: Topic[] }
  | { type: 'BACK' };
export const initialState: GameState; // { type: 'setup' }
export function reduce(state: GameState, event: GameEvent): GameState;
```

テスト: 設計書 3.2 の遷移表の全行。`feedback` が立っている間の `ANSWER` は無視。最後のお題で `NEXT` したら result。`TIME_UP` で表示中のお題を結果に含めない。表にない組み合わせでは同じ state を返す。

### タスク4: `src/game/tilt.ts`

```ts
export const TRIGGER_DEG = 45, NEUTRAL_DEG = 25;
export type TiltState = { armed: boolean };
export const initialTiltState: TiltState; // { armed: false }
export function pitchDeg(beta: number, gamma: number): number;
export function stepTilt(s: TiltState, beta: number | null, gamma: number | null):
  { state: TiltState; action: Outcome | null };
```

テスト: 設計書 6.1 の角度の表。初期状態では判定しない → ニュートラルで判定を受け付ける → −50° で正解 → ニュートラルに戻るまで次の判定をしない → +50° でパス。null は無視。

### タスク6: `batch/normalize.ts`、`batch/validate.ts`

```ts
export function normalizeTopic(text: string): string; // NFKC → trim → カタカナをひらがなに → 小文字
export type RejectReason = 'empty' | 'tooLong' | 'ng' | 'duplicate';
export type ValidationResult = {
  accepted: { text: string; text_normalized: string }[];
  rejected: Record<RejectReason, number>;
};
export function validateTopics(
  candidates: readonly string[],
  existingNormalized: ReadonlySet<string>,
  ngWords: readonly string[],
): ValidationResult;
```

テスト: キリンときりん、全角と半角の扱い。20文字は通り、21文字は通らない。前後の空白だけの文字列は empty。NG ワード。生成分の中での重複と、既存との重複。

### タスク7: `batch/prompt.ts`、`batch/generate.ts`

```ts
export const SYSTEM_PROMPT: string;
export function buildPrompt(categoryName: string, existingTexts: readonly string[], count: number): string;

export type TopicGenerator = (system: string, prompt: string) => Promise<string[]>; // 実装は Anthropic、テストではフェイク
export type CliOptions = { category?: string; all: boolean; count: number; dryRun: boolean };
export function parseArgs(argv: readonly string[]): CliOptions;
export type CategorySummary = { slug: string; status: 'ok' | 'skipped' | 'failed';
  generated: number; inserted: number; rejected: Record<RejectReason, number>; error?: string };
export function runCategory(deps: { db: SupabaseClient; generate: TopicGenerator; model: string },
  slug: string, opts: Pick<CliOptions, 'count' | 'dryRun'>): Promise<CategorySummary>;
```

テスト（ローカル Supabase）: 保存されること。再実行しても重複しないこと。`--dry-run` では書き込まないこと。上限に達したカテゴリは skipped になること。LLM がエラーを返したら failed になること。

### タスク8: `src/lib/*`

```ts
// supabase.ts
export function fetchCategories(): Promise<Category[]>;
export function fetchTopics(categoryId: number): Promise<Topic[]>;
// inputMode.ts
export function requestInputMode(): Promise<InputMode>; // スタートボタンを押した処理の中で呼ぶ
// sound.ts
export function unlockAudio(): void; // スタートボタンを押した処理の中で呼ぶ
export function playSound(kind: 'correct' | 'pass' | 'warning' | 'end'): void;
export function vibrate(pattern: number | number[]): void;
// wakeLock.ts
export function useWakeLock(active: boolean): void;
```
