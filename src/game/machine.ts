import type { Topic } from '../../shared/schema';

export type InputMode = 'tilt' | 'tap';
export type Outcome = 'correct' | 'pass';
export type Answer = { topic: Topic; outcome: Outcome };

export type GameState =
  | { type: 'setup' }
  | { type: 'countdown'; deck: Topic[]; durationSec: number; inputMode: InputMode }
  | {
      type: 'playing';
      deck: Topic[];
      index: number;
      answers: Answer[];
      endsAt: number;
      durationSec: number;
      inputMode: InputMode;
      feedback: Outcome | null;
    }
  | { type: 'result'; answers: Answer[]; deck: Topic[]; durationSec: number };

export type GameEvent =
  | { type: 'START'; deck: Topic[]; durationSec: number; inputMode: InputMode }
  | { type: 'COUNTDOWN_DONE'; now: number }
  | { type: 'ANSWER'; outcome: Outcome }
  | { type: 'NEXT' }
  | { type: 'TIME_UP' }
  | { type: 'FALLBACK_TO_TAP' }
  | { type: 'RETRY'; deck: Topic[]; inputMode: InputMode }
  | { type: 'BACK' };

type Playing = Extract<GameState, { type: 'playing' }>;

export const initialState: GameState = { type: 'setup' };

const toResult = (s: Playing): GameState => ({
  type: 'result',
  answers: s.answers,
  deck: s.deck,
  durationSec: s.durationSec,
});

/** 純粋関数。乱数と現在時刻はイベント経由で受け取る。想定外のイベントは state をそのまま返す。 */
export function reduce(state: GameState, event: GameEvent): GameState {
  switch (state.type) {
    case 'setup':
      if (event.type === 'START' && event.deck.length > 0) {
        const { deck, durationSec, inputMode } = event;
        return { type: 'countdown', deck, durationSec, inputMode };
      }
      return state;

    case 'countdown':
      if (event.type === 'COUNTDOWN_DONE') {
        return {
          type: 'playing',
          deck: state.deck,
          index: 0,
          answers: [],
          endsAt: event.now + state.durationSec * 1000,
          durationSec: state.durationSec,
          inputMode: state.inputMode,
          feedback: null,
        };
      }
      return state;

    case 'playing':
      return reducePlaying(state, event);

    case 'result':
      // 入力方法は前のラウンドを引き継がず、RETRY のたびに判定し直した値を使う
      if (event.type === 'RETRY') {
        const { deck, inputMode } = event;
        return { type: 'countdown', deck, durationSec: state.durationSec, inputMode };
      }
      if (event.type === 'BACK') return initialState;
      return state;
  }
}

function reducePlaying(state: Playing, event: GameEvent): GameState {
  switch (event.type) {
    case 'ANSWER': {
      const topic = state.deck[state.index];
      if (state.feedback !== null || topic === undefined) return state;
      return {
        ...state,
        answers: [...state.answers, { topic, outcome: event.outcome }],
        feedback: event.outcome,
      };
    }
    case 'NEXT': {
      if (state.feedback === null) return state;
      const index = state.index + 1;
      if (index >= state.deck.length) return toResult(state);
      return { ...state, index, feedback: null };
    }
    case 'TIME_UP':
      return toResult(state);
    case 'FALLBACK_TO_TAP':
      return { ...state, inputMode: 'tap' };
    default:
      return state;
  }
}
