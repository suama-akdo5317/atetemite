import { useEffect } from 'react';
import type { Answer } from '../game/machine';
import { playSound } from '../lib/sound';

export function Result({
  answers,
  onRetry,
  onBack,
}: {
  answers: Answer[];
  onRetry: () => void;
  onBack: () => void;
}) {
  const correct = answers.filter((a) => a.outcome === 'correct').length;

  useEffect(() => {
    playSound('end');
  }, []);

  return (
    <div className="min-h-full bg-sky-600 text-white">
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <p className="flex items-baseline justify-center gap-1 pt-4 text-2xl font-bold">
          <span className="font-title text-7xl leading-tight text-yellow-300">{correct}</span>
          問正解
        </p>

        {answers.length > 0 && (
          <ol>
            {answers.map((a) => (
              <li
                key={a.topic.id}
                className="flex justify-between border-b border-white/20 py-3 text-lg font-bold"
              >
                <span>{a.topic.text}</span>
                <span className={a.outcome === 'correct' ? 'text-yellow-300' : 'text-white/50'}>
                  {a.outcome === 'correct' ? '正解' : 'パス'}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-yellow-400 py-5 text-3xl font-extrabold text-sky-900"
          >
            もう一度
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-md bg-white py-4 text-xl font-bold text-sky-900"
          >
            もどる
          </button>
        </div>
      </main>
    </div>
  );
}
