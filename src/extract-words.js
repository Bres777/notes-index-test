// extract-words.js — one job: turn a piece of text into the distinct words a search can look up.

// The rules, in one place:
//   word  — an unbroken run of letters, digits and accent marks. An apostrophe between two such runs joins
//           them (`don't`, `o'brien`); every other character ends the word, so `#area/work`, `[[Project Plan]]`
//           and `notes-index` give `area work`, `project plan` and `notes index`.
//   case  — words are lower-cased, so `Plan`, `PLAN` and `plan` are one word.
//   form  — text is put into Unicode's composed form first, so an accented letter typed as one character or as
//           letter-plus-accent gives the same word. A curly apostrophe is stored as a straight one.
// The same function is used on note text when the index is built and on what the user types when searching,
// which is what makes the two agree. Nothing is skipped: titles, headings and code blocks all give words.

const WORD = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu;

// Plain code-unit comparison: the same order on every machine, whatever its locale.
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Returns the words in `text`, each once, sorted.
export function extractWords(text) {
  const words = new Set();
  for (const match of text.normalize('NFC').toLowerCase().matchAll(WORD)) {
    words.add(match[0].replaceAll('’', "'"));
  }
  return [...words].sort(byCodeUnit);
}
