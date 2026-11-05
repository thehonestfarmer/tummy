/**
 * Folds Japanese and English text to one form for matching: full-width to
 * half-width, katakana to hiragana, lowercase, and no spaces, brackets or
 * punctuation. The food table writes するめいか where a packet says スルメイカ,
 * and "Shoyu Senbei" should find "shoyu senbei". Shared by the server and the
 * import script, so the stored keys and the search terms always agree.
 */
export function fold(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}
