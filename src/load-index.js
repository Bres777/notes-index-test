// load-index.js — one job: read an index file from disk and make sure it is an index a search can trust.

import { readFileSync } from 'node:fs';

const REBUILD = 'Build it again with: node src/cli.js <folder>';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isListOfStrings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// Returns a sentence saying what is wrong with `index`, or null if nothing is.
function whatIsWrong(index) {
  if (!isPlainObject(index)) return 'it does not hold an index';

  if (!Array.isArray(index.notes)) return 'it has no list of notes';
  for (const note of index.notes) {
    if (!isPlainObject(note) || typeof note.path !== 'string' || typeof note.title !== 'string') {
      return 'one of its notes has no path or no title';
    }
  }

  if (!isPlainObject(index.tags)) return 'it has no tags';
  if (!isPlainObject(index.backlinks)) return 'it has no backlinks';
  if (!Object.hasOwn(index, 'wordIndex')) return 'it was built before search existed and has no word index';
  if (!isPlainObject(index.wordIndex)) return 'its word index is not a word index';

  const paths = new Set(index.notes.map((note) => note.path));
  for (const field of ['tags', 'backlinks', 'wordIndex']) {
    for (const [key, list] of Object.entries(index[field])) {
      if (!isListOfStrings(list)) return `"${key}" in its ${field} is not a list of notes`;
      const stray = list.find((path) => !paths.has(path));
      if (stray !== undefined) return `"${key}" in its ${field} names ${stray}, which is not one of its notes`;
    }
  }

  return null;
}

// Returns the index held in `file`, as build-index.js made it.
// Throws an Error whose message is one plain line if the file cannot be read, is not JSON, or is not an index
// that can be searched (for example one written before the word index was added).
export function loadIndex(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Index not found: ${file}\n${REBUILD}`);
    throw new Error(`Could not read ${file}: ${error.message}`);
  }

  let index;
  try {
    index = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error(`Not an index: ${file} is not JSON.\n${REBUILD}`);
  }

  const problem = whatIsWrong(index);
  if (problem) throw new Error(`Not an index that can be searched: ${file} — ${problem}.\n${REBUILD}`);

  return index;
}
