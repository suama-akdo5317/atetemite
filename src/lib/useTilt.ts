import { useEffect, useEffectEvent } from 'react';
import type { Outcome } from '../game/machine';
import { initialTiltState, stepTilt } from '../game/tilt';

const SENSOR_TIMEOUT_MS = 1000;

/**
 * 傾きで正解・パスを判定する。SENSOR_TIMEOUT_MS 以内に値が届かなければ onNoSensor を呼ぶ
 * （PC の Chrome などは API があってもセンサーが無い。FR-06）
 */
export function useTilt(
  enabled: boolean,
  onAnswer: (outcome: Outcome) => void,
  onNoSensor: () => void,
): void {
  const answer = useEffectEvent(onAnswer);
  const noSensor = useEffectEvent(onNoSensor);

  useEffect(() => {
    if (!enabled) return;
    let state = initialTiltState;
    let received = false;

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      received = true;
      const r = stepTilt(state, e.beta, e.gamma);
      state = r.state;
      if (r.action) answer(r.action);
    };
    const timer = setTimeout(() => {
      if (!received) noSensor();
    }, SENSOR_TIMEOUT_MS);

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [enabled]);
}
