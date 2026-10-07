// Tests for src/load-index.js. Index files, good and bad, are written under test/.tmp-load-index.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/build-index.js';
import { loadIndex } from '../src/load-index.js';

const here = dirname(fileURLToPath(import.meta.url));
const samples = join(here, '..', 'sample-notes');
const tmp = join(here, '.tmp-load-index');

// Writes `value` (as JSON unless it is already text) to a file under tmp and returns the file's path.
function makeIndexFile(name, value) {
  const file = join(tmp, name);
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

// A small index that is right in every way; each bad case below changes one thing about it.
function good() {
  return {
    generatedFrom: 'x',
    noteCount: 1,
    notes: [{ path: 'a.md', title: 'A', tags: ['t'], links: ['B'], words: 1 }],
    tags: { t: ['a.md'] },
    backlinks: { B: ['a.md'] },
    wordIndex: { a: ['a.md'] },
  };
}

function withChange(change) {
  const index = good();
  change(index);
  return index;
}

before(() => {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('returns the index exactly as build-index made it', () => {
  const index = buildIndex(samples);
  const file = makeIndexFile('samples.json', JSON.stringify(index, null, 2) + '\n');
  assert.deepEqual(loadIndex(file), index);
});

test('reads an index saved with a byte-order mark', () => {
  assert.deepEqual(loadIndex(makeIndexFile('bom.json', '﻿' + JSON.stringify(good()))), good());
});

test('an index of no notes is still an index', () => {
  const empty = { generatedFrom: 'x', noteCount: 0, notes: [], tags: {}, backlinks: {}, wordIndex: {} };
  assert.deepEqual(loadIndex(makeIndexFile('empty.json', empty)), empty);
});

test('keys named like built-in object properties load as ordinary keys', () => {
  const file = makeIndexFile(
    'awkward.json',
    '{"notes":[{"path":"a.md","title":"A"}],"tags":{"__proto__":["a.md"],"constructor":["a.md"]},' +
      '"backlinks":{"__proto__":["a.md"]},"wordIndex":{"constructor":["a.md"],"__proto__":["a.md"]}}',
  );
  const index = loadIndex(file);
  assert.deepEqual(Object.keys(index.tags), ['__proto__', 'constructor']);
  assert.deepEqual(index.wordIndex.constructor, ['a.md']);
  assert.equal(Object.hasOwn(index.wordIndex, '__proto__'), true);
});

test('fails plainly when the file does not exist, and says how to build one', () => {
  const file = join(tmp, 'no-such-index.json');
  assert.throws(() => loadIndex(file), {
    message: `Index not found: ${file}\nBuild it again with: node src/cli.js <folder>`,
  });
});

test('fails plainly when given a folder instead of a file', () => {
  assert.throws(() => loadIndex(tmp), { message: /^Could not read / });
});

test('fails plainly when the file is not JSON', () => {
  for (const text of ['', 'not json', '{"notes": [', '# A note\n']) {
    assert.throws(() => loadIndex(makeIndexFile('not-json.json', text)), {
      message: /^Not an index: .* is not JSON\./,
    });
  }
});

test('fails plainly when the JSON is not an index at all', () => {
  for (const value of ['null', '42', '"text"', [], [good()]]) {
    assert.throws(() => loadIndex(makeIndexFile('not-index.json', value)), {
      message: /^Not an index that can be searched: .* — it does not hold an index\./,
    });
  }
  assert.throws(() => loadIndex(makeIndexFile('package-like.json', { name: 'x', version: '1' })), /it has no list of notes/);
});

test('an index written by stage 1, with no word index, is refused with a message saying why', () => {
  const stageOne = withChange((index) => delete index.wordIndex);
  assert.throws(
    () => loadIndex(makeIndexFile('stage-one.json', stageOne)),
    /it was built before search existed and has no word index\.\nBuild it again with: node src\/cli\.js <folder>$/,
  );
});

test('each missing or misshapen part is named', () => {
  const cases = [
    [(index) => delete index.notes, /it has no list of notes/],
    [(index) => (index.notes = {}), /it has no list of notes/],
    [(index) => (index.notes = ['a.md']), /one of its notes has no path or no title/],
    [(index) => delete index.notes[0].title, /one of its notes has no path or no title/],
    [(index) => (index.notes[0].path = 7), /one of its notes has no path or no title/],
    [(index) => delete index.tags, /it has no tags/],
    [(index) => (index.tags = []), /it has no tags/],
    [(index) => delete index.backlinks, /it has no backlinks/],
    [(index) => (index.wordIndex = ['a']), /its word index is not a word index/],
    [(index) => (index.wordIndex = null), /its word index is not a word index/],
    [(index) => (index.wordIndex.a = 'a.md'), /"a" in its wordIndex is not a list of notes/],
    [(index) => (index.tags.t = [1]), /"t" in its tags is not a list of notes/],
    [(index) => (index.backlinks.B = null), /"B" in its backlinks is not a list of notes/],
  ];
  for (const [change, expected] of cases) {
    assert.throws(() => loadIndex(makeIndexFile('bad.json', withChange(change))), expected);
  }
});

test('a path listed under a word, tag or link that is not one of the notes is refused', () => {
  assert.throws(
    () => loadIndex(makeIndexFile('stray.json', withChange((index) => index.wordIndex.a.push('gone.md')))),
    /"a" in its wordIndex names gone\.md, which is not one of its notes/,
  );
  assert.throws(
    () => loadIndex(makeIndexFile('stray.json', withChange((index) => (index.tags.t = ['gone.md'])))),
    /"t" in its tags names gone\.md/,
  );
  assert.throws(
    () => loadIndex(makeIndexFile('stray.json', withChange((index) => (index.backlinks.B = ['gone.md'])))),
    /"B" in its backlinks names gone\.md/,
  );
});

test('every failure message is plain lines with no stack trace in it', () => {
  try {
    loadIndex(makeIndexFile('trace.json', 'nope'));
    assert.fail('should have thrown');
  } catch (error) {
    assert.equal(error.message.includes('    at '), false);
    assert.equal(error.message.split('\n').length, 2);
  }
});
