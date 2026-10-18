import type { ReactNode } from 'react';

/**
 * Countdown・Play の舞台。縦向きのときは CSS で 90 度回して横向きに表示する（NFR-04）。
 * 中の文字サイズは cqw/cqh（この要素基準）で指定すること。vw/vh は回転するとずれる。
 */
export function LandscapeStage({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return <main className={`landscape-stage ${className}`}>{children}</main>;
}
