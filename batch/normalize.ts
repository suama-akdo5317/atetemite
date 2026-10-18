const KATAKANA = /[ァ-ヶ]/g;
const KATAKANA_TO_HIRAGANA = 0x60;

/** 重複判定用の正規化: NFKC → 空白をすべて除く → カタカナをひらがなに → 小文字 */
export function normalizeTopic(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(KATAKANA, (c) => String.fromCharCode(c.charCodeAt(0) - KATAKANA_TO_HIRAGANA))
    .toLowerCase();
}
