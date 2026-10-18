import { useEffect } from 'react';

/** active の間は画面をスリープさせない（NFR-03）。非対応ブラウザでは何もしない */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | undefined;
    let cancelled = false;

    const acquire = () => {
      navigator.wakeLock.request('screen').then(
        (s) => {
          if (cancelled) void s.release();
          else sentinel = s;
        },
        () => {}, // 省電力モードなどで拒否されても遊べるので無視する
      );
    };
    // タブが裏に回ると自動で解放されるため、戻ってきたら取り直す
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [active]);
}
