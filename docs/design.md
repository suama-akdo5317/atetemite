# あててミテ！ 設計書

- ステータス: レビュー待ち
- 最終更新: 2026-10-17
- 要件: [requirements.md](./requirements.md)

## 1. 全体構成

### 1.1 技術スタック

| 層 | 採用 | 備考 |
|---|---|---|
| ゲーム | React 19 + Vite + TypeScript | React Compiler を有効化（`@vitejs/plugin-react` v6 の `reactCompilerPreset()` + `@rolldown/plugin-babel`） |
| CSS | Tailwind CSS v4 | `@tailwindcss/vite` + CSS の `@import "tailwindcss"`。設定ファイルなし |
| 書体 | Dela Gothic One（タイトルとカウントダウンの「おでこにかざして！」） | `@fontsource/dela-gothic-one` から、表示する文字を含む分割ファイル2つ（計約19kB）だけを `@font-face` で読み込む。本文はシステムフォント |
| ランタイム・パッケージ管理 | Bun | バッチ CLI も `bun run` で TS を直接実行する |
| Lint・整形 | Biome | |
| テスト | Vitest + Playwright | |
| 検証 | Zod 4 | |
| DB | Supabase（Postgres） | ゲームは publishable key（`anon` ロール）、バッチは secret key（`service_role`） |
| LLM | Anthropic SDK | `messages.parse()` + `zodOutputFormat()`。モデルの初期値は `claude-haiku-5-5` |
| ホスティング | Vercel | 静的 SPA として配信 |

採用しなかったもの:

- ルーター、TanStack Query、XState: 画面4つの一本道と、取得2種類しかないため不要。
- ORM（Drizzle など）: テーブルが2つだけ。Supabase CLI のマイグレーションと `supabase gen types` の型で足りる。

### 1.2 構成図

```
[スマホのブラウザ] ──読み取りのみ (publishable key / anon)──▶ [Supabase Postgres]
   Vercel 上の静的SPA                                            ▲
                                                                 │ 書き込み (secret key)
[バッチCLI: bun run batch] ──messages.parse──▶ [Claude API] ─────┘
```

### 1.3 ディレクトリ構成

ワークスペースに分けず、`package.json` は1つにまとめる。`batch/` はゲーム側から import されないので、ゲームのバンドルには含まれない。

```
atetemite/
├── docs/                 requirements.md, design.md
├── src/                  ゲーム（React）
│   ├── main.tsx, App.tsx
│   ├── game/             machine.ts, tilt.ts, deck.ts   ← 純粋関数のみ
│   ├── screens/          Setup.tsx, Countdown.tsx, Play.tsx, Result.tsx
│   └── lib/              supabase.ts, sound.ts, wakeLock.ts
├── shared/               schema.ts（Zod: Category, Topic）, database.types.ts（生成）
├── batch/                generate.ts, validate.ts, prompt.ts, ng-words.ts
├── supabase/             migrations/, seed.sql
├── e2e/                  Playwright
└── vite.config.ts, biome.json, package.json
```

### 1.4 環境変数

| 変数 | 使う側 | 内容 |
|---|---|---|
| `VITE_SUPABASE_URL` | ゲーム | Supabase の URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ゲーム | `sb_publishable_…` |
| `SUPABASE_URL` | バッチ | Supabase の URL |
| `SUPABASE_SECRET_KEY` | バッチ | `sb_secret_…` |
| `ANTHROPIC_API_KEY` | バッチ | |
| `LLM_MODEL` | バッチ | 省略時は `claude-haiku-5-5`（FR-26） |

バッチ用の変数には `VITE_` を付けない。Vite は `VITE_` で始まる変数しかクライアントに埋め込まないので、秘密情報がゲームに混ざらない（NFR-07）。

## 2. DB

### 2.1 スキーマ

```sql
create table categories (
  id           smallint generated always as identity primary key,
  slug         text not null unique,
  name         text not null,
  sort_order   smallint not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);

create table topics (
  id              bigint generated always as identity primary key,
  category_id     smallint not null references categories(id) on delete cascade,
  text            text not null check (char_length(text) between 1 and 20),
  text_normalized text not null,
  is_published    boolean not null default true,
  generated_by    text not null,
  created_at      timestamptz not null default now(),
  unique (category_id, text_normalized)
);
create index on topics (category_id) where is_published;
```

| 列 | 用途 |
|---|---|
| `categories.slug` | バッチ CLI で指定する識別子（例: `animals`） |
| `topics.text_normalized` | 重複判定用（FR-21）。作り方は 5.3 を参照 |
| `topics.is_published` | 公開フラグ（FR-25） |
| `topics.generated_by` | モデル名、または `manual`。特定の生成分をまとめて非公開にするときに使う |

文字数の上限（20文字）は DB の `check` 制約で守る。横向きの画面に大きな文字で1行に収める前提。

### 2.2 RLS

```sql
alter table categories enable row level security;
alter table topics     enable row level security;

create policy "公開カテゴリは誰でも読める" on categories for select to anon using (is_published);
create policy "公開お題は誰でも読める"     on topics     for select to anon using (is_published);

-- 新しいテーブルには Data API 用の権限が自動で付かない。必要な分だけ明示的に付ける
grant select on categories, topics to anon;
grant select, insert, update, delete on categories, topics to service_role;
revoke truncate on categories, topics from anon, authenticated, service_role;
```

- `anon` は公開中の行を読むことしかできない。書き込みは、権限を付けていないことと、書き込み用のポリシーがないことの二重で塞ぐ（NFR-05）。
- `authenticated` には何も付けない（ログイン機能がないため）。
- バッチは secret key（`service_role`、BYPASSRLS）で書き込む。

### 2.3 ゲームからの読み取り

- カテゴリ一覧: `select id, name from categories order by sort_order`
- お題: `select id, text from topics where category_id = ?` で全件を取得し、ゲーム側でシャッフルする。1カテゴリの上限は500件（5.2）で、PostgREST の初期上限1000行に収まる。
- お題が0件のカテゴリは、選んだ時点で「お題がありません」と表示する。
- 通信エラーのとき、supabase-js（postgrest-js）は GET を 1秒・2秒・4秒の間隔で3回まで自動リトライする。エラー表示（FR-11）が出るのは約7秒後で、その間は「読み込み中」のまま。一時的な電波の途切れはこれで吸収できるので、既定のまま使う。

### 2.4 運用

- お題を非公開にするときは、Supabase ダッシュボードの Table Editor で `is_published` を外す。管理画面は作らない。
- 初期カテゴリ（`seed.sql`）: 動物 / 食べ物 / 職業 / スポーツ / 乗り物

## 3. ゲームのステートマシンと画面

### 3.1 状態

```ts
type InputMode = 'tilt' | 'tap';
type Answer = { topic: Topic; outcome: 'correct' | 'pass' };

type GameState =
  | { type: 'setup' }
  | { type: 'countdown'; deck: Topic[]; durationSec: number; inputMode: InputMode }
  | { type: 'playing'; deck: Topic[]; index: number; answers: Answer[];
      endsAt: number; durationSec: number; inputMode: InputMode; feedback: 'correct' | 'pass' | null }
  | { type: 'result'; answers: Answer[]; deck: Topic[]; durationSec: number };
```

### 3.2 遷移

`reduce(state, event)` は純粋関数とし、`useReducer` に渡す。乱数（シャッフル）と現在時刻はイベントの引数として外から渡し、reducer の中では使わない。

| 現在の状態 | イベント | 遷移先・処理 |
|---|---|---|
| setup | `START {deck, durationSec, inputMode}` | countdown（`deck` は呼び出し側が `drawDeck(全お題, 問題数)` で選んだもの。FR-12） |
| countdown | `COUNTDOWN_DONE {now}` | playing（`endsAt = now + durationSec * 1000`） |
| playing | `ANSWER {outcome}` | 回答を記録し、`feedback` を立てる。`feedback` が立っている間は無視する |
| playing | `NEXT` | `index + 1` にして `feedback` を消す。お題を出し切っていたら result（FR-08） |
| playing | `TIME_UP` | result（表示中だったお題は結果に含めない） |
| playing | `FALLBACK_TO_TAP` | `inputMode` を `tap` にする（3.3 の3） |
| result | `RETRY {deck, inputMode}` | countdown（App が覚えている全お題から問題数ぶん選び直し、入力方法も 3.3 の手順で判定し直して渡す。DB は読み直さない） |
| result | `BACK` | setup |

上の表にない組み合わせ（例: setup での `ANSWER`）は、状態を変えずにそのまま返す。

- 時間の管理: 残り秒数を減らしていくのではなく、終了時刻 `endsAt` を持ち、`endsAt - now` で残り時間を計算する。タブの処理が遅れたり止まったりしても時間がずれない。表示の更新は `requestAnimationFrame` で行う。
- 副作用（効果音、振動、Wake Lock、センサーの購読、タイマー）は reducer に入れず、各画面の `useEffect` で扱う。

### 3.3 入力方法の決め方

スタートボタンと「もう一度」ボタンを押した処理の中で決める。前のラウンドで `tap` に切り替わっていても引き継がない（センサーの起動が一度遅れただけで、以降ずっとタップ操作になるのを防ぐ）。

1. `DeviceOrientationEvent.requestPermission` がある場合（iOS、Chrome 156 以降）は、ここで呼ぶ。`granted` なら `tilt`、それ以外（`denied` や `prompt`）なら `tap`。
2. `DeviceOrientationEvent` そのものがない場合は `tap`。
3. それ以外は `tilt` で始める。ただし、プレイ開始から1秒以内に β と γ の値が届かなければ `tap` に切り替える。PC の Chrome などは、センサーがなくてもこの API 自体は存在するため（FR-06）。

### 3.4 画面

| 画面 | 内容 |
|---|---|
| Setup | カテゴリのボタン一覧、秒数の入力欄（10〜300、Zod で検証。FR-02）、問題数の入力欄（1〜50、初期値8。FR-12）、スタートボタン。読み込み中の表示、エラー時の再試行ボタン（FR-11）。「横向きにしておでこへ」の案内 |
| Countdown | 画面いっぱいに「3・2・1」（FR-03） |
| Play | お題を最大サイズで表示、残り時間（FR-07）。正解は緑、パスは赤で画面をフラッシュし、約0.5秒後に `NEXT`。画面の右半分のタップで正解、左半分でパス（`inputMode` によらず常に有効。実機で試した結果、傾き操作中もタップしたいという要望があったため） |
| Result | 正解数、お題ごとの ✓／パスの一覧、「もう一度」と「カテゴリ選択に戻る」（FR-10） |

- 横向きの強制（NFR-04）: Countdown と Play は `LandscapeStage`（`<main class="landscape-stage">`）の中に描く。`@media (orientation: portrait)` のときは、この要素の幅と高さを入れ替えて `rotate(90deg) translateY(-100%)` で右に90度回す。iOS では画面の向きを固定できず、向きをロックしている人も多いため、案内を出すより回転させるほうが確実に遊べる。
  - 回転の向きは固定で、スマホの右側面が上になる。逆向きに持つと上下が逆さまになる。困った場合は、`deviceorientation` の `gamma` の符号で回転の向きを選ぶ。
  - 文字サイズは `cqw`/`cqh`（`landscape-stage` を `container-type: size` にしている）で指定する。`vw`/`vh` は回転すると縦横の基準がずれる。
  - 傾き判定（4章）は画面の法線の向きだけを見ているので、回転の影響を受けない。
- Wake Lock: Countdown に入るときに取得し、Result に入るときに解放する。対応していない端末では何もしない（NFR-03）。
- 効果音と振動（FR-09）: 正解、パス、残り5秒、終了の4つ。効果音は Web Audio API で鳴らす。iOS では最初のユーザー操作の中で AudioContext を開始する必要があるので、スタートボタンを押した処理の中で開始する。あわせて `navigator.audioSession.type = 'playback'` を設定し、消音スイッチがオンでも鳴らす（対応していないブラウザでは何もしない）。振動は `navigator.vibrate` が使える端末でだけ行う。

## 4. 傾き判定

### 4.1 計算方法

横持ちで画面が垂直の姿勢（ニュートラル）では、`gamma` がちょうど ±90° の境目にあたり、値が不安定になる。そのため β と γ から「画面の法線がどれだけ上を向いているか」を求めて、それで判定する。

```ts
// W3C の Z-X'-Y'' 回転順で、端末Z軸(画面法線)のワールド上向き成分
const facing = Math.cos(toRad(beta)) * Math.cos(toRad(gamma)); // -1..1
const pitchDeg = toDeg(Math.asin(facing)); // +90: 画面が真上, 0: 垂直, -90: 真下
```

この値は連続していて、横持ちの向きが左右どちらでも同じように扱える。`alpha`（方位角）は使わない。

### 4.2 判定

| 条件 | 判定 |
|---|---|
| `pitchDeg < -TRIGGER_DEG`（−45°） | 正解（前に倒して画面が床を向いた） |
| `pitchDeg > +TRIGGER_DEG`（+45°） | パス（後ろに倒して画面が天井を向いた） |
| `\|pitchDeg\| < NEUTRAL_DEG`（25°） | ニュートラル。次の判定を受け付ける状態に戻す |

```ts
type TiltState = { armed: boolean };
function stepTilt(
  s: TiltState, beta: number | null, gamma: number | null,
): { state: TiltState; action: 'correct' | 'pass' | null };
```

- 正解かパスを判定したら `armed = false` にし、ニュートラルに戻るまで次の判定をしない（FR-05）。
- `armed` の初期値は `false`。プレイ開始時に一度ニュートラルを通るまで判定しない。
- `beta` や `gamma` が `null` のときは無視する（3.3 の切り替えにつながる）。
- `TRIGGER_DEG` と `NEUTRAL_DEG` は調整用の定数。実機で試して調整する前提とする。値の平滑化は、誤判定が実際に問題になってから追加する。

## 5. バッチ

### 5.1 使い方

```bash
bun run batch --category animals --count 30   # 1カテゴリ
bun run batch --all --count 30                # 公開中のカテゴリすべて
bun run batch --category animals --dry-run    # 生成と検証のみ。DB には書かない
```

`--count` の初期値は30。

### 5.2 処理の流れ（1カテゴリ分）

1. 起動時に環境変数を Zod で検証する。足りなければ理由を表示して終了する。
2. secret key で接続し、カテゴリと既存のお題を取得する。既存のお題が `MAX_TOPICS_PER_CATEGORY`（500）以上なら、そのカテゴリはスキップする。
3. LLM でお題を生成する。

   ```ts
   const Output = z.object({ topics: z.array(z.string()) });
   const msg = await client.messages.parse({
     model: env.LLM_MODEL,
     max_tokens: 2048,
     system: SYSTEM_PROMPT,
     messages: [{ role: 'user', content: buildPrompt(category, existingTexts, count) }],
     output_config: { format: zodOutputFormat(Output) },
   });
   ```

   - プロンプトで指示する条件: ジェスチャーや説明で伝えられる、よく知られた名詞であること。家族で遊んでも問題ない内容であること。20文字以内であること。実在の個人名は使わないこと。
   - 既存のお題の一覧もプロンプトに含め、「これらは除いて」と伝える。
4. `validate.ts` で検証する（FR-22、5.3）。
5. `upsert(rows, { onConflict: 'category_id,text_normalized', ignoreDuplicates: true })` で保存する。同時に実行されても、最後は unique 制約で重複を防げる。`generated_by` にはモデル名を入れる。
6. 結果を表示する。例: `animals: 生成 30 / 不採用 4 (重複 3, NG 1) / 保存 26`

### 5.3 検証と正規化

1件ずつ、次の順に処理する。

1. 正規化して `text_normalized` を作る: NFKC → 空白をすべて除く → カタカナをひらがなに変える → 小文字にする。保存する `text` は前後の空白だけを除いたもの
2. 空文字なら不採用
3. 20文字を超えたら不採用（判定は正規化前の `text` で行い、DB の `check` 制約と揃える）
4. `ng-words.ts` の NG ワードを含んでいたら不採用
5. 今回の生成分の中での重複、既存との重複は不採用

不採用にしたお題は、理由ごとの件数を記録する。

### 5.4 エラー処理

- API の一時的なエラーは、SDK に組み込まれているリトライ（初期値2回）に任せる。
- 出力の形が合わない、または DB に書き込めない場合は、そのカテゴリを失敗とする。`--all` のときは残りのカテゴリの処理を続け、失敗が1つでもあれば終了コード1で終わる。
- バッチが失敗しても、ゲームは既存のお題で動く（FR-23）。
- テストのため、Anthropic のクライアントは外から渡せるようにしておく。

### 5.5 将来の拡張

- 定期実行: GitHub Actions の `schedule` で `bun run batch --all` を実行し、キーは Actions の Secrets に置く。CLI 側を変える必要はない。
- 要望フォーム（要件 7.1）: 要望文はデータ用の区切りタグで囲んでプロンプトに渡し、指示としては扱わない。LLM が採用したカテゴリ名も 5.3 の検証を通してから保存する。

## 6. テスト方針

### 6.1 単体テスト（Vitest）

| 対象 | 主なケース |
|---|---|
| `game/machine.ts` | 3.2 の遷移表の全行。`feedback` が立っている間の `ANSWER` を無視すること。お題を出し切ったら result に進むこと。`TIME_UP` で表示中のお題を結果に含めないこと。表にない組み合わせで状態が変わらないこと |
| `game/tilt.ts` | 角度の計算（β=0,γ=0 → +90°、β=90 → 0°、β=180 → −90°、γ=±90 → 0°）。`stepTilt` の一連の動き（初期状態では判定しない → ニュートラルで判定を受け付ける → −50° で正解 → ニュートラルに戻るまで次の判定をしない → null は無視） |
| `game/deck.ts` | シャッフルしても要素が欠けたり増えたりしないこと |
| 秒数入力のスキーマ | 10 と 300 は通る。9、301、60.5、空文字は通らない |
| `batch/validate.ts` | 正規化（キリン／きりん、全角／半角）、20文字の境界、NG ワード、生成分の中での重複と既存との重複 |

### 6.2 結合テスト（Vitest + ローカル Supabase）

`supabase start` と `supabase db reset` で、毎回同じ状態の DB を用意する。

- RLS: publishable key で、公開中の行だけが読めること。insert、update、delete がすべて拒否されること。
- バッチ: 決まった出力を返すフェイクのクライアントを使い、保存されること、再実行しても重複しないこと、`--dry-run` で書き込まないこと、上限に達したカテゴリをスキップすることを確認する。

### 6.3 E2E（Playwright）

データはローカル Supabase に投入した固定のお題を使う。

- タップ操作: PC の Chromium にはセンサーがないので `tap` に切り替わる。カテゴリ選択 → カウントダウン → 左右タップ → 結果画面、の流れを通す。時間は `page.clock` で早送りする。
- 傾き操作: `page.evaluate` で `DeviceOrientationEvent` を合成して送り、正解とパスが判定されることを確認する。
- 異常系: DB につながらないとき、エラー表示と再試行ボタンが出ること。

### 6.4 実機での確認（手動）

Vercel のプレビュー環境（HTTPS）、または次のトンネルで、次を確認する。

- トンネルでの確認: `supabase start` → `bun run dev:phone`（ポート5175） → `cloudflared tunnel --url http://localhost:5175`。発行された `https://*.trycloudflare.com` をスマホで開く。DB は Vite のプロキシ（`/supabase/rest/v1` のみ）経由で読むので、スマホからローカルの Supabase に直接つながなくてよい。URL を知っていれば誰でも開けるので、確認が終わったら止める。

- [ ] iOS Safari でセンサーの許可ダイアログが出て、許可・拒否のどちらでも遊べる
- [ ] Android Chrome（156 以降は `requestPermission` がある）でも傾き操作になる。許可ダイアログが出るかどうかも確認する
- [ ] 傾きのしきい値が自然に感じられる（`TRIGGER_DEG` / `NEUTRAL_DEG` の調整）
- [ ] プレイ中に画面がスリープしない
- [ ] 効果音が鳴り、Android では振動する
- [ ] 向きをロックしたまま横に持っても、横向きで表示される（右側面を上にして持つ）

### 6.5 カバレッジ

`src/game/` と `batch/` のロジックで80%以上を目標とする。画面のコンポーネントは E2E で確認する範囲として、カバレッジの数値には含めない。
