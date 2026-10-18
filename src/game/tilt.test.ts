import { describe, expect, it } from 'vitest';
import { initialTiltState, pitchDeg, stepTilt, type TiltState } from './tilt';

describe('pitchDeg', () => {
  it.each([
    [0, 0, 90], // 画面が真上
    [90, 0, 0], // 縦持ちで垂直
    [180, 0, -90], // 画面が真下
    [0, 90, 0], // 横持ちで垂直
    [0, -90, 0], // 逆向きの横持ちで垂直
    [150, 0, -60],
    [30, 0, 60],
  ])('beta=%d gamma=%d → %d°', (beta, gamma, expected) => {
    expect(pitchDeg(beta, gamma)).toBeCloseTo(expected, 5);
  });
});

// beta だけで角度を作る: 90 → 0°, 150 → -60°, 30 → +60°, 60 → +30°
const NEUTRAL = 90;
const DOWN = 150;
const UP = 30;
const HALFWAY = 60;

const run = (betas: (number | null)[], start: TiltState = initialTiltState) => {
  let state = start;
  return betas.map((beta) => {
    const r = stepTilt(state, beta, beta === null ? null : 0);
    state = r.state;
    return r.action;
  });
};

describe('stepTilt', () => {
  it('does not fire before passing through neutral', () => {
    expect(run([DOWN, UP])).toEqual([null, null]);
  });

  it('fires correct when tilted down after neutral', () => {
    expect(run([NEUTRAL, DOWN])).toEqual([null, 'correct']);
  });

  it('fires pass when tilted up after neutral', () => {
    expect(run([NEUTRAL, UP])).toEqual([null, 'pass']);
  });

  it('fires only once until returning to neutral (FR-05)', () => {
    expect(run([NEUTRAL, DOWN, DOWN, HALFWAY, DOWN, NEUTRAL, UP])).toEqual([
      null,
      'correct',
      null,
      null,
      null,
      null,
      'pass',
    ]);
  });

  it('does not fire between neutral and trigger thresholds', () => {
    expect(run([NEUTRAL, HALFWAY])).toEqual([null, null]);
  });

  it('ignores null readings and keeps state', () => {
    const armed = { armed: true };
    const r = stepTilt(armed, null, null);
    expect(r).toEqual({ state: armed, action: null });
    expect(r.state).toBe(armed);
  });
});
