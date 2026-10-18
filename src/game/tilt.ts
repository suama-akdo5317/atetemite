import type { Outcome } from './machine';

// ponytail: 実機での体感に合わせて調整する前提のしきい値。誤判定が多ければ平滑化を足す
export const TRIGGER_DEG = 45;
export const NEUTRAL_DEG = 25;

export type TiltState = { armed: boolean };
export const initialTiltState: TiltState = { armed: false };

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * 画面の法線がどれだけ上を向いているか（+90: 真上, 0: 垂直, -90: 真下）。
 * W3C の Z-X'-Y'' 回転順で端末 Z 軸のワールド上向き成分は cos(β)·cos(γ)。
 * 横持ち垂直で γ が ±90° の境目に来ても連続した値になる。
 */
export function pitchDeg(beta: number, gamma: number): number {
  const facing = Math.cos(toRad(beta)) * Math.cos(toRad(gamma));
  return toDeg(Math.asin(Math.max(-1, Math.min(1, facing))));
}

/** 判定後はニュートラルに戻るまで次の判定をしない（ヒステリシス）。 */
export function stepTilt(
  state: TiltState,
  beta: number | null,
  gamma: number | null,
): { state: TiltState; action: Outcome | null } {
  if (beta === null || gamma === null) return { state, action: null };

  const pitch = pitchDeg(beta, gamma);
  if (Math.abs(pitch) < NEUTRAL_DEG) {
    return { state: state.armed ? state : { armed: true }, action: null };
  }
  if (!state.armed) return { state, action: null };
  if (pitch < -TRIGGER_DEG) return { state: { armed: false }, action: 'correct' };
  if (pitch > TRIGGER_DEG) return { state: { armed: false }, action: 'pass' };
  return { state, action: null };
}
