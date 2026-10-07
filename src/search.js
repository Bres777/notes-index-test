// search.js — one job: answer one question about an index: which notes contain a word, carry a tag, or link to a note.

// The rules, in one place:
//   word     — what is typed is split into words exactly as note text was (extract-words.js), so capitals and
//              punctuation make no difference. A note matches if it contains every one of those words, as whole
//              words: `plan` does not match `planning`.
//   tag      — capitals make no difference and a leading `#` is optional. The whole tag must match: `archive`
//              does not match `archive/2025`.
//   links-to — what is typed is a note's title, or the path of a note in the index (which stands for that
//              note's title). Capitals make no difference here, although the index keeps `[[Plan]]` and
//              `[[plan]]` apart: a search for either lists the notes that wrote either. A link to a title that
//              no note has is still found, and is called broken.
// Nothing here touches a file: an index object goes in and a plain answer comes out.

import { extractWords } from './extract-words.js';

export const KINDS = ['word', 'tag', 'links-to'];

// Thrown when what was typed cannot be searched for at all (nothing but spaces, say). The message is one plain
// line meant for the person who typed it.
export class QueryError extends Error {}

// Plain code-unit comparison: the same order on every machine, whatever its locale.
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The list kept under `key`, or an empty list. Only the index's own keys count, so `constructor` or
// `__proto__` find what the notes say and never something built into objects.
function listUnder(lists, key) {
  return Object.hasOwn(lists, key) ? lists[key] : [];
}

// So that capitals, and the two ways of typing an accented letter, make no difference to a title.
function fold(text) {
  return text.normalize('NFC').toLowerCase();
}

function plural(count, one, many) {
  return count === 1 ? one : many;
}

function pathsWithWord(index, text, remarks) {
  const words = extractWords(text);
  if (words.length === 0) {
    throw new QueryError(`There is no word to look for in "${text}": it has no letters or digits.`);
  }
  if (words.length > 1) {
    remarks.push(`"${text}" was read as ${words.length} words (${words.join(', ')}); a note must contain all of them.`);
  }

  let paths = listUnder(index.wordIndex, words[0]);
  for (const word of words.slice(1)) {
    const withWord = new Set(listUnder(index.wordIndex, word));
    paths = paths.filter((path) => withWord.has(path));
  }
  return paths;
}

function pathsWithTag(index, text, remarks) {
  const tag = text.trim().replace(/^#+/, '').replace(/[-\/]+$/, '').toLowerCase();
  if (tag === '') throw new QueryError(`There is no tag to look for in "${text}".`);

  const longer = Object.keys(index.tags).filter((other) => other.startsWith(`${tag}/`));
  if (longer.length > 0) {
    remarks.push(
      `Tags are matched whole, so ${longer.map((other) => `#${other}`).join(', ')} ` +
        `${plural(longer.length, 'is a different tag and is', 'are different tags and are')} not included.`,
    );
  }

  return listUnder(index.tags, tag);
}

function pathsLinkingTo(index, text, remarks) {
  const typed = text.trim();
  if (typed === '') throw new QueryError('There is no note name to look for.');

  const wanted = new Set([fold(typed)]);
  const typedAsPath = typed.replaceAll('\\', '/');
  for (const note of index.notes) {
    if (note.path === typedAsPath && !wanted.has(fold(note.title))) {
      wanted.add(fold(note.title));
      remarks.push(`${note.path} is the note titled "${note.title}"; links to that title are listed.`);
    }
  }

  const targets = Object.keys(index.backlinks).filter((target) => wanted.has(fold(target)));
  const paths = targets.flatMap((target) => index.backlinks[target]);
  const titled = index.notes.filter((note) => wanted.has(fold(note.title)));

  if (targets.length > 1) {
    remarks.push(`Links written as ${targets.map((target) => `"${target}"`).join(' and ')} are all counted.`);
  }
  if (titled.length === 0) {
    const found = new Set(paths).size;
    remarks.push(
      found === 0
        ? `No note is titled "${typed}" either.`
        : `No note is titled "${typed}": ${plural(found, 'this is a broken link', 'these are broken links')}.`,
    );
  }
  if (titled.length > 1) {
    remarks.push(
      `${titled.length} notes are titled "${titled[0].title}" (${titled.map((note) => note.path).join(', ')}); ` +
        'a link names a title, not a path, so the index cannot say which of them a link means.',
    );
  }

  return paths;
}

const FINDERS = { word: pathsWithWord, tag: pathsWithTag, 'links-to': pathsLinkingTo };

// `index` is what build-index.js returns (or load-index.js reads back); `kind` is one of KINDS; `text` is what
// the user typed.
// Returns { notes, remarks }.
//   notes   — { path, title } for each matching note, each once, sorted by path. Empty if nothing matches.
//   remarks — plain sentences worth showing next to the answer: a broken link, two notes sharing a title, a
//             query read as several words. Usually empty.
// Throws QueryError if `text` holds nothing to search for, and TypeError if `kind` is not one of KINDS.
export function search(index, kind, text) {
  if (!Object.hasOwn(FINDERS, kind)) throw new TypeError(`Unknown kind of search: ${kind}`);

  const remarks = [];
  const paths = [...new Set(FINDERS[kind](index, text, remarks))].sort(byCodeUnit);
  const titles = new Map(index.notes.map((note) => [note.path, note.title]));

  return { notes: paths.map((path) => ({ path, title: titles.get(path) })), remarks };
}
