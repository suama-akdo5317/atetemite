import type { InputMode } from '../game/machine';

type PermissionRequest = () => Promise<'granted' | 'denied'>;

/**
 * スタートボタンのクリック処理の中で、await より前に呼ぶこと。
 * iOS の requestPermission はユーザー操作の中でしか許可ダイアログを出さない。
 */
export function requestInputMode(): Promise<InputMode> {
  if (typeof DeviceOrientationEvent === 'undefined') return Promise.resolve('tap');
  const request = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionRequest })
    .requestPermission;
  // iOS 以外は許可不要。センサーが無い環境は Play 画面で 1 秒後に tap へ切り替える
  if (typeof request !== 'function') return Promise.resolve('tilt');
  return request.call(DeviceOrientationEvent).then(
    (result) => (result === 'granted' ? 'tilt' : 'tap'),
    () => 'tap',
  );
}
