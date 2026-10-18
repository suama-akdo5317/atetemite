import { useEffect, useState } from 'react';
import {
  type Category,
  DURATION_DEFAULT,
  DURATION_MAX,
  DURATION_MIN,
  DurationSchema,
  type Topic,
} from '../../shared/schema';
import { shuffle } from '../game/deck';
import type { InputMode } from '../game/machine';
import { requestInputMode } from '../lib/inputMode';
import { unlockAudio } from '../lib/sound';
import { fetchCategories, fetchTopics } from '../lib/supabase';

export type StartParams = { deck: Topic[]; durationSec: number; inputMode: InputMode };

type CategoriesLoad =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; categories: Category[] };

const LOAD_ERROR = '読み込めませんでした。通信状況を確認して、もう一度お試しください。';

function loadCategories(set: (load: CategoriesLoad) => void): void {
  fetchCategories().then(
    (categories) => set({ status: 'ready', categories }),
    () => set({ status: 'error' }),
  );
}

export function Setup({ onStart }: { onStart: (params: StartParams) => void }) {
  const [load, setLoad] = useState<CategoriesLoad>({ status: 'loading' });
  const [selected, setSelected] = useState<number | null>(null);
  const [duration, setDuration] = useState(String(DURATION_DEFAULT));
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;
    loadCategories((next) => active && setLoad(next));
    return () => {
      active = false;
    };
  }, []);

  const retry = () => {
    setLoad({ status: 'loading' });
    loadCategories(setLoad);
  };

  const start = () => {
    const parsed = DurationSchema.safeParse(duration);
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? '秒数が正しくありません');
    if (selected === null) return setError('カテゴリを選んでください');

    // どちらもクリック処理の中で、await より前に呼ぶ必要がある（iOS）
    unlockAudio();
    const inputMode = requestInputMode();

    setError(null);
    setStarting(true);
    Promise.all([inputMode, fetchTopics(selected)]).then(
      ([mode, topics]) => {
        if (topics.length === 0) {
          setStarting(false);
          return setError('このカテゴリにはまだお題がありません');
        }
        onStart({ deck: shuffle(topics), durationSec: parsed.data, inputMode: mode });
      },
      () => {
        setStarting(false);
        setError(LOAD_ERROR);
      },
    );
  };

  return (
    <div className="min-h-full bg-sky-600 text-white">
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <h1 className="py-2 text-center font-title text-5xl">あててミテ！</h1>

        <section aria-labelledby="category-heading">
          <h2 id="category-heading" className="mb-3 text-white/80">
            なにで遊ぶ？
          </h2>
          <CategoryList load={load} selected={selected} onSelect={setSelected} onRetry={retry} />
        </section>

        <section>
          <label htmlFor="duration" className="mb-3 block text-white/80">
            何秒にする？
          </label>
          <div className="flex items-center gap-2">
            <input
              id="duration"
              type="number"
              inputMode="numeric"
              min={DURATION_MIN}
              max={DURATION_MAX}
              step={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-28 rounded-md bg-white px-4 py-3 text-2xl font-bold text-sky-900"
            />
            <span className="text-lg">
              秒（{DURATION_MIN}〜{DURATION_MAX}）
            </span>
          </div>
        </section>

        {error && (
          <p role="alert" className="font-bold text-yellow-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="rounded-md bg-yellow-400 py-5 text-3xl font-extrabold text-sky-900 disabled:opacity-50"
        >
          {starting ? '準備中…' : 'スタート'}
        </button>
      </main>
    </div>
  );
}

function CategoryList({
  load,
  selected,
  onSelect,
  onRetry,
}: {
  load: CategoriesLoad;
  selected: number | null;
  onSelect: (id: number) => void;
  onRetry: () => void;
}) {
  if (load.status === 'loading') return <p className="text-white/80">読み込み中…</p>;
  if (load.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="font-bold text-yellow-300">{LOAD_ERROR}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-white px-4 py-2 font-bold text-sky-900"
        >
          再試行
        </button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {load.categories.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={selected === c.id}
          onClick={() => onSelect(c.id)}
          className="rounded-md bg-white py-4 text-xl font-bold text-sky-900 aria-pressed:bg-yellow-400"
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
