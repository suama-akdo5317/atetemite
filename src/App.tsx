import { useReducer, useState } from 'react';
import type { Topic } from '../shared/schema';
import { drawDeck } from './game/deck';
import { initialState, reduce } from './game/machine';
import { requestInputMode } from './lib/inputMode';
import { useWakeLock } from './lib/useWakeLock';
import { Countdown } from './screens/Countdown';
import { Play } from './screens/Play';
import { Result } from './screens/Result';
import { Setup } from './screens/Setup';

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  // もう一度のときに、カテゴリの全お題から選び直すために覚えておく
  const [round, setRound] = useState<{ pool: Topic[]; questionCount: number }>({
    pool: [],
    questionCount: 0,
  });
  useWakeLock(state.type === 'countdown' || state.type === 'playing');

  switch (state.type) {
    case 'setup':
      return (
        <Setup
          onStart={({ pool, questionCount, durationSec, inputMode }) => {
            setRound({ pool, questionCount });
            dispatch({
              type: 'START',
              deck: drawDeck(pool, questionCount),
              durationSec,
              inputMode,
            });
          }}
        />
      );
    case 'countdown':
      return <Countdown onDone={(now) => dispatch({ type: 'COUNTDOWN_DONE', now })} />;
    case 'playing':
      return <Play state={state} dispatch={dispatch} />;
    case 'result':
      return (
        <Result
          answers={state.answers}
          onRetry={() => {
            // クリック処理の中で呼ぶ（iOS の許可確認のため）。許可済みならすぐ返る
            requestInputMode().then((inputMode) =>
              dispatch({
                type: 'RETRY',
                deck: drawDeck(round.pool, round.questionCount),
                inputMode,
              }),
            );
          }}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      );
  }
}
