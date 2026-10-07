// Tests for src/extract-words.js. Pure text in, list out: no files are touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractWords } from '../src/extract-words.js';

test('words are lower-cased, unique and sorted', () => {
  assert.deepEqual(extractWords('Zebra apple ZEBRA Apple mango'), ['apple', 'mango', 'zebra']);
});

test('punctuation, brackets and Markdown marks end a word and are not part of it', () => {
  assert.deepEqual(extractWords('Hello, world. (Really?) **bold** _soft_ "quoted" end!'), [
    'bold',
    'end',
    'hello',
    'quoted',
    'really',
    'soft',
    'world',
  ]);
});

test('tags, wiki-links and hyphenated words are split into their parts', () => {
  assert.deepEqual(extractWords('#area/work [[Project Plan|the plan]] notes-index snake_case'), [
    'area',
    'case',
    'index',
    'notes',
    'plan',
    'project',
    'snake',
    'the',
    'work',
  ]);
});

test('digits are words, on their own or mixed with letters', () => {
  assert.deepEqual(extractWords('Issue #42 in 2026, see q3 and 3rd'), ['2026', '3rd', '42', 'and', 'in', 'issue', 'q3', 'see']);
});

test('an apostrophe inside a word is kept; one at the edge is dropped', () => {
  assert.deepEqual(extractWords("don't 'quoted' dogs' rock'n'roll"), ['dogs', "don't", 'quoted', "rock'n'roll"]);
});

test('a curly apostrophe and a straight one give the same word', () => {
  assert.deepEqual(extractWords('O’Brien'), extractWords("o'brien"));
  assert.deepEqual(extractWords('O’Brien'), ["o'brien"]);
});

test('letters outside English are words, and capitals are folded there too', () => {
  assert.deepEqual(extractWords('Café ÉCOLE Ünïcode 日本語 Привет'), ['café', 'école', 'ünïcode', 'привет', '日本語']);
});

test('an accented letter gives the same word whether typed as one character or as letter plus accent', () => {
  const composed = 'café';
  const decomposed = 'café';
  assert.notEqual(composed, decomposed);
  assert.deepEqual(extractWords(decomposed), [composed]);
  assert.deepEqual(extractWords(composed), [composed]);
});

test('every kind of line ending and white space separates words', () => {
  assert.deepEqual(extractWords('one\ntwo\r\nthree\rfour\tfive six'), ['five', 'four', 'one', 'six', 'three', 'two']);
});

test('nothing is skipped: titles, headings and code blocks all give words', () => {
  assert.deepEqual(extractWords('# Title\n## Section\n```\ncode here\n```\n'), ['code', 'here', 'section', 'title']);
});

test('text with no letters or digits gives no words', () => {
  assert.deepEqual(extractWords(''), []);
  assert.deepEqual(extractWords('--- *** ### ... \u{1F600} ﻿'), []);
});

test('words named like built-in object properties are ordinary words', () => {
  assert.deepEqual(extractWords('constructor __proto__ toString'), ['constructor', 'proto', 'tostring']);
});
