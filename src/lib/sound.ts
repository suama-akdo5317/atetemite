type SoundKind = 'correct' | 'pass' | 'warning' | 'end';

/** [周波数Hz, 開始秒, 長さ秒] の並び */
const SOUNDS: Record<SoundKind, [number, number, number][]> = {
  correct: [
    [880, 0, 0.12],
    [1320, 0.12, 0.2],
  ],
  pass: [[220, 0, 0.25]],
  warning: [[660, 0, 0.08]],
  end: [
    [523, 0, 0.2],
    [392, 0.2, 0.2],
    [262, 0.4, 0.5],
  ],
};

const VIBRATIONS: Record<SoundKind, number | number[]> = {
  correct: 80,
  pass: [40, 60, 40],
  warning: 30,
  end: 400,
};

let ctx: AudioContext | undefined;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/** iOS はユーザー操作の中で AudioContext を開始しないと音が出ないため、スタート時に呼ぶ */
export function unlockAudio(): void {
  // iOS Safari: 'playback' にすると消音スイッチがオンでも鳴る。AudioContext を作る前に設定する
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session) session.type = 'playback';
  ctx ??= new AudioContext();
  void ctx.resume();
}

export function playSound(kind: SoundKind): void {
  if (ctx) {
    const now = ctx.currentTime;
    for (const [freq, start, duration] of SOUNDS[kind]) beep(ctx, freq, now + start, duration);
  }
  // iOS Safari は vibrate 非対応
  navigator.vibrate?.(VIBRATIONS[kind]);
}

function beep(audio: AudioContext, freq: number, at: number, duration: number): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.3, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration);
}
