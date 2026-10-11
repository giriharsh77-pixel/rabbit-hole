/**
 * "Is this article in English?" — a deliberately simple check on the title and
 * excerpt, good enough to keep a Portuguese Medium post out of an English
 * reading list.  Non-Latin scripts (Devanagari, Hangul, …) count as not
 * English; for Latin text, English function words must outnumber those of the
 * common European languages, and heavy use of accents counts against.
 */
const EN = new Set(
  'the and of to in is for on with that this it was are how what why you its from about by an be at as not but his her they we who their has have had will would can just than more into when'.split(' '),
);
const OTHER = new Set(
  [
    // Portuguese
    'de do da dos das no na nos nas em um uma uns umas é e eu ele ela meu minha seu sua muito também foi ser são está estava não com por para mais como mas isso esse essa aqui tem já só ainda você sobre quando ao aos',
    // Spanish
    'que la el los las del se su sus es y lo al muy esta este yo mi pero porque cuando sobre más como hay fue',
    // French
    'le les des est une et pour dans sur qui pas je ne au du ce cette mais avec sont très',
    // Italian / German / Dutch / Indonesian
    'di che il per della sono und der das ist nicht mit ein eine auf ich auch sich noch wie wenn oder aber zu im het een van yang dan ini itu dengan',
  ]
    .join(' ')
    .split(' '),
);
const BOILERPLATE = /continue reading on medium\s*»?|read more|the post .* appeared first on .*$/gi;

export function looksEnglish(input: string): boolean {
  const text = input.replace(BOILERPLATE, ' ');
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 12) return true; // too little to judge
  const latin = letters.filter((ch) => /[A-Za-zÀ-ɏ]/.test(ch)).length;
  if (latin / letters.length < 0.7) return false;
  const accented = letters.filter((ch) => /[À-ɏ]/.test(ch)).length / letters.length;
  let en = 0;
  let other = 0;
  for (const w of text.toLowerCase().split(/[^\p{L}']+/u)) {
    if (EN.has(w)) en++;
    else if (OTHER.has(w)) other++;
  }
  return en - other - (accented > 0.03 ? 2 : 0) >= 0;
}
