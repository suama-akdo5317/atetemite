import { type ActionDispatch, useEffect, useEffectEvent, useState } from 'react';
import type { GameEvent, GameState } from '../game/machine';
import { playSound } from '../lib/sound';
import { useTilt } from '../lib/useTilt';
import { LandscapeStage } from './LandscapeStage';

type Playing = Extract<GameState, { type: 'playing' }>;

const FEEDBACK_MS = 500;
const WARNING_SEC = 5;

const BACKGROUND = {
  correct: 'bg-emerald-500',
  pass: 'bg-rose-500',
  none: 'bg-sky-600',
} as const;

const FEEDBACK_LABEL = { correct: '正解！', pass: 'パス' } as const;

export function Play({
  state,
  dispatch,
}: {
  state: Playing;
  dispatch: ActionDispatch<[GameEvent]>;
}) {
  const remaining = useRemainingSeconds(state.endsAt, () => dispatch({ type: 'TIME_UP' }));
  useFeedback(state, () => dispatch({ type: 'NEXT' }));
  useTilt(
    state.inputMode === 'tilt',
    (outcome) => dispatch({ type: 'ANSWER', outcome }),
    () => dispatch({ type: 'FALLBACK_TO_TAP' }),
  );

  const topic = state.deck[state.index];
  const length = Math.max([...(topic?.text ?? '')].length, 1);

  return (
    <LandscapeStage
      className={`flex items-center justify-center text-white select-none ${BACKGROUND[state.feedback ?? 'none']}`}
    >
      <p
        role="timer"
        className="absolute top-4 right-6 text-5xl font-black tabular-nums"
        aria-label={`残り${remaining}秒`}
      >
        {remaining}
      </p>
      <p
        data-testid="topic"
        className="px-4 text-center leading-tight font-black"
        style={{ fontSize: `min(45cqh, ${88 / length}cqw)` }}
        aria-live="polite"
      >
        {state.feedback ? FEEDBACK_LABEL[state.feedback] : topic?.text}
      </p>
      {/* 傾き操作のときもタップで答えられる（FR-06） */}
      <TapZones onAnswer={(outcome) => dispatch({ type: 'ANSWER', outcome })} />
    </LandscapeStage>
  );
}

function TapZones({ onAnswer }: { onAnswer: (outcome: 'correct' | 'pass') => void }) {
  return (
    <div className="absolute inset-0 flex">
      <button
        type="button"
        className="flex flex-1 items-end justify-start p-6 text-2xl font-bold opacity-80"
        onClick={() => onAnswer('pass')}
      >
        ← パス
      </button>
      <button
        type="button"
        className="flex flex-1 items-end justify-end p-6 text-2xl font-bold opacity-80"
        onClick={() => onAnswer('correct')}
      >
        正解 →
      </button>
    </div>
  );
}

/** endsAt から残り秒数を計算する。時刻基準なのでタブの処理が遅れてもずれない */
function useRemainingSeconds(endsAt: number, onTimeUp: () => void): number {
  const [remaining, setRemaining] = useState(() => Math.ceil((endsAt - performance.now()) / 1000));
  const timeUp = useEffectEvent(onTimeUp);

  useEffect(() => {
    let frame = 0;
    let last = -1;
    const tick = () => {
      const ms = endsAt - performance.now();
      if (ms <= 0) return timeUp();
      const sec = Math.ceil(ms / 1000);
      if (sec !== last) {
        last = sec;
        setRemaining(sec);
        if (sec === WARNING_SEC) playSound('warning');
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [endsAt]);

  return remaining;
}

/** 正解・パスの演出を出して、FEEDBACK_MS 後に次のお題へ進める */
function useFeedback(state: Playing, onNext: () => void): void {
  const next = useEffectEvent(onNext);
  const { feedback } = state;

  // ANSWER のたびに feedback は null → 値 と変わるので、feedback だけで毎回発火する
  useEffect(() => {
    if (feedback === null) return;
    playSound(feedback);
    const timer = setTimeout(next, FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);
}
