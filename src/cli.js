#!/usr/bin/env node
// cli.js — one job: the command line. Reads the arguments, builds the index, writes it, prints one line.

import { statSync, writeFileSync } from 'node:fs';

import { buildIndex } from './build-index.js';

const USAGE = 'Usage: node src/cli.js <folder> [--out index.json]';
const DEFAULT_OUT = 'index.json';

// Stops the program with a plain message and a non-zero exit code.
function fail(message) {
  console.error(message);
  process.exit(1);
}

// Returns { folder, out }, or stops the program if the arguments make no sense.
function readArguments(args) {
  let folder = null;
  let out = DEFAULT_OUT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      if (i + 1 >= args.length) fail(`--out needs a file name.\n${USAGE}`);
      out = args[++i];
    } else if (args[i].startsWith('--')) {
      fail(`Unknown option: ${args[i]}\n${USAGE}`);
    } else if (folder === null) {
      folder = args[i];
    } else {
      fail(`Only one folder can be indexed at a time.\n${USAGE}`);
    }
  }

  if (folder === null) fail(USAGE);
  return { folder, out };
}

function isFolder(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const { folder, out } = readArguments(process.argv.slice(2));

if (!isFolder(folder)) fail(`Folder not found: ${folder}`);

const index = buildIndex(folder);
if (index.noteCount === 0) fail(`No notes (.md files) found in: ${folder}`);

try {
  writeFileSync(out, JSON.stringify(index, null, 2) + '\n');
} catch (error) {
  fail(`Could not write ${out}: ${error.message}`);
}

const tagCount = Object.keys(index.tags).length;
const linkCount = Object.keys(index.backlinks).length;
console.log(`Indexed ${index.noteCount} notes, ${tagCount} tags and ${linkCount} links from ${folder} into ${out}`);
