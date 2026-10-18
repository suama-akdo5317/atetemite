import { z } from 'zod';

export const CategorySchema = z.object({ id: z.number().int(), name: z.string() });
export const TopicSchema = z.object({ id: z.number().int(), text: z.string() });
export type Category = z.infer<typeof CategorySchema>;
export type Topic = z.infer<typeof TopicSchema>;

export const DURATION_MIN = 10;
export const DURATION_MAX = 300;
export const DURATION_DEFAULT = 60;

const DURATION_MESSAGE = `${DURATION_MIN}〜${DURATION_MAX}秒の整数で入力してください`;

/** 入力欄の文字列を秒数に変換する。空文字は 0 になり、範囲外として弾かれる。 */
export const DurationSchema = z.coerce
  .number({ error: DURATION_MESSAGE })
  .int({ error: DURATION_MESSAGE })
  .min(DURATION_MIN, { error: DURATION_MESSAGE })
  .max(DURATION_MAX, { error: DURATION_MESSAGE });
