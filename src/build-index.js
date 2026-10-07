// build-index.js — one job: scan a folder, parse every note in it, and return one index object.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scan } from './scan.js';
import { parseNote } from './parse-note.js';
import { extractWords } from './extract-words.js';

// Adds `path` to the list kept under `key`, creating the list on first use.
function addTo(lists, key, path) {
  if (!lists.has(key)) lists.set(key, []);
  lists.get(key).push(path);
}

// A Map is used while collecting so that a tag or title such as "constructor" cannot collide with
// anything built into objects; keys come out sorted so the same notes always give the same index.
function toSortedObject(lists) {
  return Object.fromEntries([...lists.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// Returns { generatedFrom, noteCount, notes, tags, backlinks, wordIndex }.
//   notes     — one parse-note result per note, in scan order; each `path` is relative to `folder`.
//   tags      — tag -> paths of the notes carrying it.
//   backlinks — link target, exactly as written in `[[...]]` -> paths of the notes that link to it.
//               A target is listed whether or not any note has that title.
//   wordIndex — word -> paths of the notes containing it; extract-words.js says what a word is.
// Throws the usual fs error if `folder` does not exist or is not a folder.
export function buildIndex(folder) {
  const notes = [];
  const tags = new Map();
  const backlinks = new Map();
  const wordIndex = new Map();

  for (const path of scan(folder)) {
    const text = readFileSync(join(folder, path), 'utf8');
    const note = parseNote(text, path);
    notes.push(note);
    for (const tag of note.tags) addTo(tags, tag, path);
    for (const target of note.links) addTo(backlinks, target, path);
    for (const word of extractWords(text)) addTo(wordIndex, word, path);
  }

  return {
    generatedFrom: folder.replaceAll('\\', '/'),
    noteCount: notes.length,
    notes,
    tags: toSortedObject(tags),
    backlinks: toSortedObject(backlinks),
    wordIndex: toSortedObject(wordIndex),
  };
}
