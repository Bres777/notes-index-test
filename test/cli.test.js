// Tests for src/cli.js. Each test runs the real command as a separate process; output goes under test/.tmp-cli.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/build-index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'src', 'cli.js');
const tmp = join(here, '.tmp-cli');

// Runs the command from the repository root (or `cwd`) and returns { status, stdout, stderr }.
function run(args, cwd = root) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

before(() => {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'empty'), { recursive: true });
  mkdirSync(join(tmp, 'no-notes'), { recursive: true });
  mkdirSync(join(tmp, 'run-here'), { recursive: true });
  mkdirSync(join(tmp, 'one-note'), { recursive: true });
  writeFileSync(join(tmp, 'no-notes', 'readme.txt'), 'not a note');
  writeFileSync(join(tmp, 'one-note', 'only.md'), 'no tags, no links');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('writes the index to --out and prints one line with the counts', () => {
  const out = join(tmp, 'samples.json');
  const result = run(['sample-notes', '--out', out]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `Indexed 6 notes, 8 tags and 5 links from sample-notes into ${out}\n`);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), {
    ...buildIndex(join(root, 'sample-notes')),
    generatedFrom: 'sample-notes',
  });
});

test('the written file has the five index fields and ends with a newline', () => {
  const out = join(tmp, 'fields.json');
  run(['sample-notes', '--out', out]);

  const text = readFileSync(out, 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.deepEqual(Object.keys(JSON.parse(text)), ['generatedFrom', 'noteCount', 'notes', 'tags', 'backlinks']);
});

test('--out may come before the folder', () => {
  const out = join(tmp, 'out-first.json');
  const result = run(['--out', out, 'sample-notes']);

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).noteCount, 6);
});

test('without --out it writes index.json in the folder the command is run from', () => {
  const runHere = join(tmp, 'run-here');
  const result = run([join(root, 'sample-notes')], runHere);

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(readFileSync(join(runHere, 'index.json'), 'utf8')).noteCount, 6);
});

test('a folder with one plain note reports 1 notes, 0 tags and 0 links', () => {
  const result = run([join(tmp, 'one-note'), '--out', join(tmp, 'one.json')]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Indexed 1 notes, 0 tags and 0 links /);
});

test('fails with a plain message when the folder does not exist', () => {
  const out = join(tmp, 'never-written-1.json');
  const result = run(['no-such-folder', '--out', out]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Folder not found: no-such-folder\n');
  assert.equal(existsSync(out), false);
});

test('fails with a plain message when the folder is really a file', () => {
  const result = run(['package.json', '--out', join(tmp, 'never-written-2.json')]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'Folder not found: package.json\n');
});

test('fails with a plain message when the folder holds no notes', () => {
  for (const name of ['empty', 'no-notes']) {
    const folder = join(tmp, name);
    const out = join(tmp, `never-written-${name}.json`);
    const result = run([folder, '--out', out]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, `No notes (.md files) found in: ${folder}\n`);
    assert.equal(existsSync(out), false);
  }
});

test('fails with the usage line when no folder is given', () => {
  const result = run([]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'Usage: node src/cli.js <folder> [--out index.json]\n');
});

test('fails when --out has no file name, an option is unknown, or two folders are given', () => {
  assert.match(run(['sample-notes', '--out']).stderr, /^--out needs a file name\./);
  assert.match(run(['sample-notes', '--loud']).stderr, /^Unknown option: --loud/);
  assert.match(run(['sample-notes', 'test']).stderr, /^Only one folder can be indexed at a time\./);
  assert.equal(run(['sample-notes', '--out']).status, 1);
  assert.equal(run(['sample-notes', '--loud']).status, 1);
  assert.equal(run(['sample-notes', 'test']).status, 1);
});

test('fails with a plain message, not a stack trace, when the index cannot be written', () => {
  const result = run(['sample-notes', '--out', join(tmp, 'no-such-folder', 'index.json')]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Could not write /);
  assert.equal(result.stderr.includes('    at '), false);
});
