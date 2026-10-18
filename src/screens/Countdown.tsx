import { useEffect, useEffectEvent, useState } from 'react';
import { playSound } from '../lib/sound';
import { LandscapeStage } from './LandscapeStage';

const COUNT_FROM = 3;

export function Countdown({ onDone }: { onDone: (now: number) => void }) {
  const [count, setCount] = useState(COUNT_FROM);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    if (count === 0) return done(performance.now());
    playSound('warning');
    const timer = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(timer);
  }, [count]);

  return (
    <LandscapeStage className="flex flex-col items-center justify-center gap-[4cqh] bg-sky-600 text-white">
      <p className="font-title text-[9cqh]">おでこにかざして！</p>
      <p
        data-testid="countdown"
        className="text-[50cqh] leading-none font-bold tabular-nums"
        aria-live="assertive"
      >
        {count > 0 ? count : ''}
      </p>
    </LandscapeStage>
  );
}
