import { normalizeTopic } from './normalize';

/** DB の check 制約（char_length 1〜20）と揃える */
export const TOPIC_MAX_LENGTH = 20;

export type RejectReason = 'empty' | 'tooLong' | 'ng' | 'duplicate';
export type AcceptedTopic = { text: string; text_normalized: string };
export type ValidationResult = {
  accepted: AcceptedTopic[];
  rejected: Record<RejectReason, number>;
};

/** FR-21 / FR-22: 空文字・文字数・NG ワード・重複を順にチェックする */
export function validateTopics(
  candidates: readonly string[],
  existingNormalized: ReadonlySet<string>,
  ngWords: readonly string[],
): ValidationResult {
  const ng = ngWords.map(normalizeTopic).filter((w) => w !== '');
  const seen = new Set(existingNormalized);
  const accepted: AcceptedTopic[] = [];
  const rejected: Record<RejectReason, number> = { empty: 0, tooLong: 0, ng: 0, duplicate: 0 };

  for (const candidate of candidates) {
    const text = candidate.trim();
    const normalized = normalizeTopic(text);
    const reason = rejectReason(text, normalized, ng, seen);
    if (reason) {
      rejected[reason]++;
      continue;
    }
    seen.add(normalized);
    accepted.push({ text, text_normalized: normalized });
  }
  return { accepted, rejected };
}

function rejectReason(
  text: string,
  normalized: string,
  ng: readonly string[],
  seen: ReadonlySet<string>,
): RejectReason | null {
  if (normalized === '') return 'empty';
  // char_length と同じくコードポイント単位で数える
  if ([...text].length > TOPIC_MAX_LENGTH) return 'tooLong';
  if (ng.some((w) => normalized.includes(w))) return 'ng';
  if (seen.has(normalized)) return 'duplicate';
  return null;
}
