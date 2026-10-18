import { useReducer } from 'react';
import { shuffle } from './game/deck';
import { initialState, reduce } from './game/machine';
import { requestInputMode } from './lib/inputMode';
import { useWakeLock } from './lib/useWakeLock';
import { Countdown } from './screens/Countdown';
import { Play } from './screens/Play';
import { Result } from './screens/Result';
import { Setup } from './screens/Setup';

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  useWakeLock(state.type === 'countdown' || state.type === 'playing');

  switch (state.type) {
    case 'setup':
      return <Setup onStart={(params) => dispatch({ type: 'START', ...params })} />;
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
              dispatch({ type: 'RETRY', deck: shuffle(state.deck), inputMode }),
            );
          }}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      );
  }
}
