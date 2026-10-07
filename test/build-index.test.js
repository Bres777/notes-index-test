// Tests for src/build-index.js, run against sample-notes/ plus awkward folders built under test/.tmp-build-index.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/build-index.js';

const here = dirname(fileURLToPath(import.meta.url));
const samples = join(here, '..', 'sample-notes');
const tmp = join(here, '.tmp-build-index');

function makeFile(relativePath, text) {
  const full = join(tmp, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

before(() => {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'empty'), { recursive: true });
  makeFile('awkward/a.md', '# Same Title\n#constructor #__proto__ #toString [[__proto__]] [[constructor]] [[a]]\n');
  makeFile('awkward/b.md', '# Same Title\n#constructor [[Same Title]] [[same title]]\n');
  makeFile('awkward/.git/ignored.md', '# Ignored\n#ignored [[Ignored]]\n');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('sample notes: counts and the list of notes, in scan order', () => {
  const index = buildIndex(samples);
  assert.equal(index.noteCount, 6);
  assert.equal(index.notes.length, 6);
  assert.deepEqual(
    index.notes.map((note) => [note.path, note.title]),
    [
      ['journal/2026-10-01.md', 'Meeting Notes'],
      ['journal/archive/old-ideas.md', 'old-ideas'],
      ['project-plan.md', 'Project Plan'],
      ['reading-list.md', 'Reading List'],
      ['scratch.md', 'scratch'],
      ['welcome.md', 'Welcome'],
    ],
  );
});

test('sample notes: one note in full', () => {
  const plan = buildIndex(samples).notes.find((note) => note.path === 'project-plan.md');
  assert.deepEqual(plan, {
    path: 'project-plan.md',
    title: 'Project Plan',
    tags: ['planning', 'work'],
    links: ['Budget 2027', 'Welcome', 'Meeting Notes'],
    words: 38,
  });
});

test('sample notes: tags map each tag to the notes carrying it', () => {
  assert.deepEqual(buildIndex(samples).tags, {
    'archive/2025': ['journal/archive/old-ideas.md'],
    guide: ['welcome.md'],
    idea: ['journal/archive/old-ideas.md', 'scratch.md'],
    journal: ['journal/2026-10-01.md'],
    planning: ['project-plan.md'],
    reading: ['reading-list.md'],
    start: ['welcome.md'],
    work: ['journal/2026-10-01.md', 'project-plan.md', 'scratch.md'],
  });
});

test('sample notes: backlinks map each link target to the notes linking to it', () => {
  assert.deepEqual(buildIndex(samples).backlinks, {
    'Budget 2027': ['project-plan.md'],
    'Meeting Notes': ['project-plan.md'],
    'Project Plan': ['journal/2026-10-01.md', 'scratch.md', 'welcome.md'],
    'Reading List': ['welcome.md'],
    Welcome: ['journal/2026-10-01.md', 'project-plan.md'],
  });
});

test('sample notes: a link to a note that does not exist is still listed in backlinks', () => {
  const index = buildIndex(samples);
  assert.equal(index.notes.some((note) => note.title === 'Budget 2027'), false);
  assert.deepEqual(index.backlinks['Budget 2027'], ['project-plan.md']);
});

test('tag and backlink keys come out sorted', () => {
  const index = buildIndex(samples);
  assert.deepEqual(Object.keys(index.tags), Object.keys(index.tags).sort());
  assert.deepEqual(Object.keys(index.backlinks), Object.keys(index.backlinks).sort());
});

test('generatedFrom is the folder as given, with forward slashes', () => {
  assert.equal(buildIndex(samples).generatedFrom, samples.replaceAll('\\', '/'));
  assert.equal(buildIndex(samples.replaceAll('/', '\\')).generatedFrom.includes('\\'), false);
});

test('the index survives a trip through JSON unchanged', () => {
  const index = buildIndex(samples);
  assert.deepEqual(JSON.parse(JSON.stringify(index)), index);
});

test('building twice gives the same index', () => {
  assert.deepEqual(buildIndex(samples), buildIndex(samples));
});

test('tags and link targets named like built-in object properties are kept as ordinary keys', () => {
  const index = buildIndex(join(tmp, 'awkward'));
  const text = JSON.stringify(index);
  const reread = JSON.parse(text);
  assert.deepEqual(Object.keys(reread.tags), ['__proto__', 'constructor', 'tostring']);
  assert.deepEqual(reread.tags.constructor, ['a.md', 'b.md']);
  assert.deepEqual(Object.keys(reread.backlinks), ['Same Title', '__proto__', 'a', 'constructor', 'same title']);
});

test('two notes with the same title are both kept, and link targets are not merged by case', () => {
  const index = buildIndex(join(tmp, 'awkward'));
  assert.deepEqual(index.notes.map((note) => note.title), ['Same Title', 'Same Title']);
  assert.deepEqual(index.backlinks['Same Title'], ['b.md']);
  assert.deepEqual(index.backlinks['same title'], ['b.md']);
});

test('notes in skipped folders are left out of the index entirely', () => {
  const index = buildIndex(join(tmp, 'awkward'));
  assert.equal(index.noteCount, 2);
  assert.equal('ignored' in index.tags, false);
});

test('an empty folder gives an empty index rather than an error', () => {
  const index = buildIndex(join(tmp, 'empty'));
  assert.equal(index.noteCount, 0);
  assert.deepEqual(index.notes, []);
  assert.deepEqual(index.tags, {});
  assert.deepEqual(index.backlinks, {});
});

test('throws when the folder does not exist', () => {
  assert.throws(() => buildIndex(join(tmp, 'no-such-folder')), { code: 'ENOENT' });
});
