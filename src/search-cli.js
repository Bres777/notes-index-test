#!/usr/bin/env node
// search-cli.js — one job: the search command line. Reads the arguments, loads the index, searches it, prints the notes.

import { loadIndex } from './load-index.js';
import { search, QueryError, KINDS } from './search.js';

const USAGE = 'Usage: node src/search-cli.js (--word <word> | --tag <tag> | --links-to <note>) [--index index.json]';
const DEFAULT_INDEX = 'index.json';

// What to say when a search of each kind finds nothing.
const NOTHING_FOUND = {
  word: (text) => `No note contains "${text}".`,
  tag: (text) => `No note carries the tag "${text}".`,
  'links-to': (text) => `No note links to "${text}".`,
};

// Stops the program with a plain message and a non-zero exit code.
function fail(message) {
  console.error(message);
  process.exit(1);
}

// Returns { kind, text, indexFile }, or stops the program if the arguments make no sense.
function readArguments(args) {
  let kind = null;
  let text = null;
  let indexFile = DEFAULT_INDEX;

  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    const name = option.slice(2);

    if (option === '--index') {
      if (i + 1 >= args.length) fail(`--index needs a file name.\n${USAGE}`);
      indexFile = args[++i];
    } else if (option.startsWith('--') && KINDS.includes(name)) {
      if (i + 1 >= args.length) fail(`${option} needs something to look for.\n${USAGE}`);
      if (kind !== null) fail(`Only one of --word, --tag and --links-to can be used at a time.\n${USAGE}`);
      kind = name;
      text = args[++i];
    } else if (option.startsWith('--')) {
      fail(`Unknown option: ${option}\n${USAGE}`);
    } else {
      fail(`Unexpected argument: ${option}\nIf what you are looking for has spaces in it, put it in quotes.\n${USAGE}`);
    }
  }

  if (kind === null) fail(USAGE);
  return { kind, text, indexFile };
}

const { kind, text, indexFile } = readArguments(process.argv.slice(2));

let index;
try {
  index = loadIndex(indexFile);
} catch (error) {
  fail(error.message);
}

let found;
try {
  found = search(index, kind, text);
} catch (error) {
  if (!(error instanceof QueryError)) throw error;
  fail(error.message);
}

// The notes go to standard output and nothing else does, so the output can be piped or saved as it is.
// Everything said about the answer goes to standard error.
for (const note of found.notes) console.log(`${note.path}\t${note.title}`);
if (found.notes.length === 0) console.error(NOTHING_FOUND[kind](text));
for (const remark of found.remarks) console.error(remark);
