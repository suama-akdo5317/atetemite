import { describe, expect, it } from 'vitest';
import type { Topic } from '../../shared/schema';
import { type GameState, initialState, reduce } from './machine';

const topic = (id: number): Topic => ({ id, text: `お題${id}` });
const deck = [topic(1), topic(2), topic(3)];

const countdown: GameState = { type: 'countdown', deck, durationSec: 60, inputMode: 'tilt' };
const playing: Extract<GameState, { type: 'playing' }> = {
  type: 'playing',
  deck,
  index: 0,
  answers: [],
  endsAt: 61_000,
  durationSec: 60,
  inputMode: 'tilt',
  feedback: null,
};

describe('reduce', () => {
  it('starts in setup', () => {
    expect(initialState).toEqual({ type: 'setup' });
  });

  it('setup + START → countdown', () => {
    expect(
      reduce(initialState, { type: 'START', deck, durationSec: 60, inputMode: 'tilt' }),
    ).toEqual(countdown);
  });

  it('ignores START with an empty deck', () => {
    const s = reduce(initialState, { type: 'START', deck: [], durationSec: 60, inputMode: 'tap' });
    expect(s).toBe(initialState);
  });

  it('countdown + COUNTDOWN_DONE → playing with endsAt = now + duration', () => {
    expect(reduce(countdown, { type: 'COUNTDOWN_DONE', now: 1_000 })).toEqual(playing);
  });

  it('ANSWER records the current topic and raises feedback', () => {
    const s = reduce(playing, { type: 'ANSWER', outcome: 'correct' });
    expect(s).toMatchObject({
      index: 0,
      feedback: 'correct',
      answers: [{ topic: topic(1), outcome: 'correct' }],
    });
  });

  it('ignores ANSWER while feedback is shown (FR-05)', () => {
    const s = reduce(playing, { type: 'ANSWER', outcome: 'pass' });
    expect(reduce(s, { type: 'ANSWER', outcome: 'correct' })).toBe(s);
  });

  it('NEXT advances and clears feedback', () => {
    const s = reduce(reduce(playing, { type: 'ANSWER', outcome: 'pass' }), { type: 'NEXT' });
    expect(s).toMatchObject({ type: 'playing', index: 1, feedback: null });
  });

  it('ignores NEXT without feedback', () => {
    expect(reduce(playing, { type: 'NEXT' })).toBe(playing);
  });

  it('NEXT after the last topic → result (FR-08)', () => {
    const last = { ...playing, index: 2 };
    const s = reduce(reduce(last, { type: 'ANSWER', outcome: 'correct' }), { type: 'NEXT' });
    expect(s).toEqual({
      type: 'result',
      answers: [{ topic: topic(3), outcome: 'correct' }],
      deck,
      durationSec: 60,
    });
  });

  it('TIME_UP → result without the unanswered current topic', () => {
    const answered = reduce(reduce(playing, { type: 'ANSWER', outcome: 'correct' }), {
      type: 'NEXT',
    });
    const s = reduce(answered, { type: 'TIME_UP' });
    expect(s).toMatchObject({
      type: 'result',
      answers: [{ topic: topic(1), outcome: 'correct' }],
    });
  });

  it('TIME_UP during feedback keeps the just-answered topic', () => {
    const s = reduce(reduce(playing, { type: 'ANSWER', outcome: 'pass' }), { type: 'TIME_UP' });
    expect(s).toMatchObject({ type: 'result', answers: [{ topic: topic(1), outcome: 'pass' }] });
  });

  it('FALLBACK_TO_TAP switches input mode', () => {
    expect(reduce(playing, { type: 'FALLBACK_TO_TAP' })).toMatchObject({ inputMode: 'tap' });
  });

  it('result + RETRY → countdown with the given deck and re-detected input mode', () => {
    // 前のラウンドで tap に切り替わっていても、RETRY で判定し直した値を使う
    const result = reduce({ ...playing, inputMode: 'tap' }, { type: 'TIME_UP' });
    const reshuffled = [topic(3), topic(1), topic(2)];
    expect(reduce(result, { type: 'RETRY', deck: reshuffled, inputMode: 'tilt' })).toEqual({
      type: 'countdown',
      deck: reshuffled,
      durationSec: 60,
      inputMode: 'tilt',
    });
  });

  it('result + BACK → setup', () => {
    const result = reduce(playing, { type: 'TIME_UP' });
    expect(reduce(result, { type: 'BACK' })).toEqual({ type: 'setup' });
  });

  it.each([
    ['setup', initialState, { type: 'ANSWER', outcome: 'correct' }],
    ['setup', initialState, { type: 'TIME_UP' }],
    ['countdown', countdown, { type: 'NEXT' }],
    ['countdown', countdown, { type: 'BACK' }],
    ['playing', playing, { type: 'START', deck, durationSec: 60, inputMode: 'tap' }],
    ['playing', playing, { type: 'RETRY', deck, inputMode: 'tap' }],
  ] as const)('ignores unrelated events in %s', (_name, state, event) => {
    expect(reduce(state, event)).toBe(state);
  });
});
