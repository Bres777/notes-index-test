// build-index.js — one job: scan a folder, parse every note in it, and return one index object.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scan } from './scan.js';
import { parseNote } from './parse-note.js';

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

// Returns { generatedFrom, noteCount, notes, tags, backlinks }.
//   notes     — one parse-note result per note, in scan order; each `path` is relative to `folder`.
//   tags      — tag -> paths of the notes carrying it.
//   backlinks — link target, exactly as written in `[[...]]` -> paths of the notes that link to it.
//               A target is listed whether or not any note has that title.
// Throws the usual fs error if `folder` does not exist or is not a folder.
export function buildIndex(folder) {
  const notes = scan(folder).map((path) => parseNote(readFileSync(join(folder, path), 'utf8'), path));

  const tags = new Map();
  const backlinks = new Map();
  for (const note of notes) {
    for (const tag of note.tags) addTo(tags, tag, note.path);
    for (const target of note.links) addTo(backlinks, target, note.path);
  }

  return {
    generatedFrom: folder.replaceAll('\\', '/'),
    noteCount: notes.length,
    notes,
    tags: toSortedObject(tags),
    backlinks: toSortedObject(backlinks),
  };
}
