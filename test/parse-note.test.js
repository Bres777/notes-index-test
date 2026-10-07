// Tests for src/parse-note.js. Pure text in, object out: no files are touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseNote } from '../src/parse-note.js';

function note(lines, path = 'folder/some-note.md') {
  return parseNote(lines.join('\n'), path);
}

test('returns the path it was given, unchanged', () => {
  assert.equal(note(['# T'], 'a/b/c.md').path, 'a/b/c.md');
});

// --- title ---

test('title is the first "# " heading', () => {
  assert.equal(note(['intro line', '# Real Title', '# Second Title']).title, 'Real Title');
});

test('title falls back to the file name without .md when there is no heading', () => {
  assert.equal(note(['just text'], 'folder/some-note.md').title, 'some-note');
  assert.equal(note(['just text'], 'folder\\windows-path.md').title, 'windows-path');
  assert.equal(note(['just text'], 'SHOUT.MD').title, 'SHOUT');
  assert.equal(note(['just text'], 'two.dots.md').title, 'two.dots');
});

test('"## " and deeper headings are not the title', () => {
  assert.equal(note(['## Section', '### Smaller']).title, 'some-note');
});

test('"#word" with no space is a tag, not a title', () => {
  const parsed = note(['#project is the topic']);
  assert.equal(parsed.title, 'some-note');
  assert.deepEqual(parsed.tags, ['project']);
});

test('a "# " line inside a fenced code block is not the title', () => {
  assert.equal(note(['```', '# shell comment', '```', '# Real Title']).title, 'Real Title');
  assert.equal(note(['~~~', '# shell comment', '~~~']).title, 'some-note');
});

test('title is trimmed, and an empty "# " line is not a title', () => {
  assert.equal(note(['#    Spaced Out   ']).title, 'Spaced Out');
  assert.equal(note(['# ', 'text']).title, 'some-note');
});

test('title is found behind a byte-order mark and with Windows line endings', () => {
  assert.equal(parseNote('﻿# With BOM\r\nbody #tag\r\n', 'x.md').title, 'With BOM');
  assert.deepEqual(parseNote('﻿# With BOM\r\nbody #tag\r\n', 'x.md').tags, ['tag']);
});

// --- tags ---

test('tags are lower-cased, unique and sorted', () => {
  assert.deepEqual(note(['#Zebra #apple #ZEBRA', 'more #Apple and #mango']).tags, ['apple', 'mango', 'zebra']);
});

test('tags are not read from heading lines', () => {
  assert.deepEqual(note(['# Title with #titletag', '## Section #sectiontag', 'body #bodytag']).tags, ['bodytag']);
});

test('tags are not read from fenced code blocks', () => {
  assert.deepEqual(note(['```', '#include <stdio.h>', '```', '#real']).tags, ['real']);
});

test('a "#" in the middle of a word or a web address is not a tag', () => {
  assert.deepEqual(note(['see https://example.com/page#section and C#sharp and a#b']).tags, []);
});

test('a number on its own is not a tag, but a tag may contain digits', () => {
  assert.deepEqual(note(['issue #123 and #2026-plan and #q3']).tags, ['2026-plan', 'q3']);
});

test('tags stop at punctuation and may sit inside brackets', () => {
  assert.deepEqual(note(['#one, #two. (#three) #four!']).tags, ['four', 'one', 'three', 'two']);
});

test('tags may contain "_", "-" and "/", and lose a trailing "-" or "/"', () => {
  assert.deepEqual(note(['#snake_case #kebab-case #area/work #dangling- #slash/']).tags, [
    'area/work',
    'dangling',
    'kebab-case',
    'slash',
    'snake_case',
  ]);
});

test('tags may use letters outside English', () => {
  assert.deepEqual(note(['#Café #日本語']).tags, ['café', '日本語']);
});

test('a lone "#" and "#" followed by a space are not tags', () => {
  assert.deepEqual(note(['a # b', 'ends with #']).tags, []);
});

// --- links ---

test('links are unique and in order of first appearance', () => {
  assert.deepEqual(note(['[[Zebra]] then [[Apple]]', '[[Zebra]] again, then [[Mango]]']).links, [
    'Zebra',
    'Apple',
    'Mango',
  ]);
});

test('links keep their capital letters and inner spaces, and lose outer spaces', () => {
  assert.deepEqual(note(['[[ Note Name ]] and [[note name]]']).links, ['Note Name', 'note name']);
});

test('"[[Name|shown text]]" and "[[Name#section]]" both link to Name', () => {
  assert.deepEqual(note(['[[Plan|the plan]] [[Plan#Risks]] [[Other#Part|shown]]']).links, ['Plan', 'Other']);
});

test('a "#" inside a link is not a tag', () => {
  assert.deepEqual(note(['[[Plan#Risks]]']).tags, []);
});

test('empty, unclosed and ordinary Markdown links are not wiki-links', () => {
  assert.deepEqual(note(['[[]] [[  ]] [[|shown]] [[unclosed [single] [text](url.md)']).links, []);
});

test('links are read from heading lines but not from fenced code blocks', () => {
  assert.deepEqual(note(['## See [[In Heading]]', '```', '[[In Code]]', '```']).links, ['In Heading']);
});

test('two links on one line are both found', () => {
  assert.deepEqual(note(['[[A]][[B]]']).links, ['A', 'B']);
});

// --- words ---

test('words counts the body, leaving out the title line', () => {
  assert.equal(note(['# A Title Of Five Words', 'one two three']).words, 3);
});

test('words counts every line when the title came from the file name', () => {
  assert.equal(note(['one two', 'three']).words, 3);
});

test('words ignores chunks with no letter or digit', () => {
  assert.equal(note(['- one', '* two', '---', '> three & four', '## Five']).words, 5);
});

test('words counts tags, links and code as written', () => {
  assert.equal(note(['#tag [[Two Words]]', '```', 'let x = 1;', '```']).words, 6);
});

test('an empty note has no title heading, no tags, no links and no words', () => {
  assert.deepEqual(parseNote('', 'empty.md'), { path: 'empty.md', title: 'empty', tags: [], links: [], words: 0 });
});
