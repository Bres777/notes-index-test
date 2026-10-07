// Tests for src/scan.js. Folders are built at test time under test/.tmp-scan (git cannot hold empty folders).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scan } from '../src/scan.js';

const tmp = join(dirname(fileURLToPath(import.meta.url)), '.tmp-scan');

function makeFile(relativePath, text = 'x') {
  const full = join(tmp, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

before(() => {
  rmSync(tmp, { recursive: true, force: true });
  makeFile('tree/zebra.md');
  makeFile('tree/alpha.md');
  makeFile('tree/Beta.md');
  makeFile('tree/SHOUT.MD');
  makeFile('tree/readme.txt');
  makeFile('tree/md');
  makeFile('tree/notes.md.bak');
  makeFile('tree/sub/inner.md');
  makeFile('tree/sub/deeper/deepest.md');
  makeFile('tree/node_modules/package/hidden.md');
  makeFile('tree/sub/node_modules/hidden.md');
  makeFile('tree/.obsidian/hidden.md');
  makeFile('tree/sub/.trash/hidden.md');
  makeFile('tree/.hidden-file.md');
  makeFile('tree/looks-like-a-note.md/inside.md');
  mkdirSync(join(tmp, 'tree/empty-folder'), { recursive: true });
  mkdirSync(join(tmp, 'empty'), { recursive: true });
  makeFile('only-text/a.txt');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('finds .md files recursively, sorted, with forward slashes, relative to the folder', () => {
  assert.deepEqual(scan(join(tmp, 'tree')), [
    '.hidden-file.md',
    'Beta.md',
    'SHOUT.MD',
    'alpha.md',
    'looks-like-a-note.md/inside.md',
    'sub/deeper/deepest.md',
    'sub/inner.md',
    'zebra.md',
  ]);
});

test('skips node_modules and dot folders at any depth', () => {
  const found = scan(join(tmp, 'tree'));
  assert.equal(found.some((path) => path.includes('hidden.md') && path.includes('/')), false);
});

test('a dot FILE is still a note; only dot FOLDERS are skipped', () => {
  assert.ok(scan(join(tmp, 'tree')).includes('.hidden-file.md'));
});

test('a folder whose name ends in .md is walked, not listed as a note', () => {
  const found = scan(join(tmp, 'tree'));
  assert.ok(found.includes('looks-like-a-note.md/inside.md'));
  assert.equal(found.includes('looks-like-a-note.md'), false);
});

test('symbolic links and junctions are left out, so a loop of links cannot trap the scan', (t) => {
  makeFile('links/real/a.md');
  try {
    symlinkSync(join(tmp, 'links'), join(tmp, 'links/real/back-to-top'), 'junction');
  } catch {
    t.skip('this system would not let the test create a link');
    return;
  }
  assert.deepEqual(scan(join(tmp, 'links')), ['real/a.md']);
});

test('gives the same answer every time', () => {
  assert.deepEqual(scan(join(tmp, 'tree')), scan(join(tmp, 'tree')));
});

test('a trailing slash on the folder changes nothing', () => {
  assert.deepEqual(scan(join(tmp, 'tree') + '/'), scan(join(tmp, 'tree')));
});

test('returns an empty list for an empty folder or one with no notes', () => {
  assert.deepEqual(scan(join(tmp, 'empty')), []);
  assert.deepEqual(scan(join(tmp, 'only-text')), []);
});

test('throws when the folder does not exist', () => {
  assert.throws(() => scan(join(tmp, 'no-such-folder')), { code: 'ENOENT' });
});

test('throws when given a file instead of a folder', () => {
  assert.throws(() => scan(join(tmp, 'tree/alpha.md')), { code: 'ENOTDIR' });
});
