// Tests for src/search-cli.js. Each test runs the real commands as separate processes: the index is built by
// src/cli.js and then searched by src/search-cli.js, so the two are tested joined up. Files go under test/.tmp-search-cli.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const indexer = join(root, 'src', 'cli.js');
const searcher = join(root, 'src', 'search-cli.js');
const tmp = join(here, '.tmp-search-cli');
const samplesIndex = join(tmp, 'samples.json');

const USAGE = 'Usage: node src/search-cli.js (--word <word> | --tag <tag> | --links-to <note>) [--index index.json]\n';

// Runs the search command from the repository root (or `cwd`) and returns { status, stdout, stderr }.
function run(args, cwd = root) {
  return spawnSync(process.execPath, [searcher, ...args], { cwd, encoding: 'utf8' });
}

// Runs a search of the sample notes' index.
function find(...args) {
  return run([...args, '--index', samplesIndex]);
}

before(() => {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'run-here'), { recursive: true });
  mkdirSync(join(tmp, 'no-index-here'), { recursive: true });

  const built = spawnSync(process.execPath, [indexer, 'sample-notes', '--out', samplesIndex], { cwd: root, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  spawnSync(process.execPath, [indexer, join(root, 'sample-notes')], { cwd: join(tmp, 'run-here') });

  const stageOne = JSON.parse(readFileSync(samplesIndex, 'utf8'));
  delete stageOne.wordIndex;
  writeFileSync(join(tmp, 'stage-one.json'), JSON.stringify(stageOne));
  writeFileSync(join(tmp, 'not-json.json'), 'this is not JSON');
});

after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('--word prints one line per matching note, path then a tab then title, and nothing else', () => {
  const result = find('--word', 'welcome');

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    'journal/2026-10-01.md\tMeeting Notes\nproject-plan.md\tProject Plan\nwelcome.md\tWelcome\n',
  );
});

test('--tag prints the notes carrying the tag, whatever its capitals and with or without "#"', () => {
  for (const typed of ['work', '#Work', 'WORK']) {
    const result = find('--tag', typed);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(
      result.stdout,
      'journal/2026-10-01.md\tMeeting Notes\nproject-plan.md\tProject Plan\nscratch.md\tscratch\n',
    );
  }
});

test('--links-to prints the notes linking to the note, given its title in any capitals or its path', () => {
  const expected = 'journal/2026-10-01.md\tMeeting Notes\nscratch.md\tscratch\nwelcome.md\tWelcome\n';

  for (const typed of ['Project Plan', 'project plan']) {
    const result = find('--links-to', typed);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, expected);
    assert.equal(result.stderr, '');
  }

  const byPath = find('--links-to', 'project-plan.md');
  assert.equal(byPath.status, 0);
  assert.equal(byPath.stdout, expected);
  assert.equal(byPath.stderr, 'project-plan.md is the note titled "Project Plan"; links to that title are listed.\n');
});

test('a broken link is still found, and is called broken on standard error', () => {
  const result = find('--links-to', 'Budget 2027');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'project-plan.md\tProject Plan\n');
  assert.equal(result.stderr, 'No note is titled "Budget 2027": this is a broken link.\n');
});

test('finding nothing is not a failure: exit code 0, nothing on standard output, one line saying so', () => {
  const cases = [
    [['--word', 'zebra'], 'No note contains "zebra".\n'],
    [['--tag', 'zebra'], 'No note carries the tag "zebra".\n'],
    [['--links-to', 'scratch'], 'No note links to "scratch".\n'],
    [['--links-to', 'Zebra'], 'No note links to "Zebra".\nNo note is titled "Zebra" either.\n'],
    [
      ['--tag', 'archive'],
      'No note carries the tag "archive".\n' +
        'Tags are matched whole, so #archive/2025 is a different tag and is not included.\n',
    ],
  ];
  for (const [args, stderr] of cases) {
    const result = find(...args);
    assert.equal(result.status, 0, args.join(' '));
    assert.equal(result.stdout, '', args.join(' '));
    assert.equal(result.stderr, stderr, args.join(' '));
  }
});

test('a query of several words finds notes with all of them and says how it was read', () => {
  const result = find('--word', 'Meeting Welcome');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'journal/2026-10-01.md\tMeeting Notes\nproject-plan.md\tProject Plan\n');
  assert.equal(result.stderr, '"Meeting Welcome" was read as 2 words (meeting, welcome); a note must contain all of them.\n');
});

test('--index may come before the query', () => {
  const result = run(['--index', samplesIndex, '--tag', 'guide']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'welcome.md\tWelcome\n');
});

test('without --index it reads index.json in the folder the command is run from', () => {
  const result = run(['--word', 'welcome'], join(tmp, 'run-here'));

  assert.equal(result.status, 0);
  assert.equal(result.stdout.split('\n').length, 4);
});

test('fails with a plain message when there is no index, and says how to build one', () => {
  const result = run(['--word', 'welcome'], join(tmp, 'no-index-here'));

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Index not found: index.json\nBuild it again with: node src/cli.js <folder>\n');
});

test('fails with a plain message when the index file is not an index', () => {
  const notJson = run(['--word', 'welcome', '--index', join(tmp, 'not-json.json')]);
  assert.equal(notJson.status, 1);
  assert.equal(notJson.stdout, '');
  assert.match(notJson.stderr, /^Not an index: .*not-json\.json is not JSON\.\n/);

  const somethingElse = run(['--word', 'welcome', '--index', 'package.json']);
  assert.equal(somethingElse.status, 1);
  assert.equal(
    somethingElse.stderr,
    'Not an index that can be searched: package.json — it has no list of notes.\n' +
      'Build it again with: node src/cli.js <folder>\n',
  );
});

test('an index written before search existed is refused for every kind of search, not only --word', () => {
  for (const args of [['--word', 'welcome'], ['--tag', 'work'], ['--links-to', 'Welcome']]) {
    const result = run([...args, '--index', join(tmp, 'stage-one.json')]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /it was built before search existed and has no word index\.\nBuild it again with/);
  }
});

test('fails with the usage line when nothing is asked for', () => {
  assert.equal(run([]).status, 1);
  assert.equal(run([]).stderr, USAGE);
  assert.equal(run(['--index', samplesIndex]).stderr, USAGE);
});

test('fails when an option has no value, is unknown, or two searches are asked for at once', () => {
  const cases = [
    [['--word'], '--word needs something to look for.\n' + USAGE],
    [['--tag'], '--tag needs something to look for.\n' + USAGE],
    [['--links-to'], '--links-to needs something to look for.\n' + USAGE],
    [['--word', 'a', '--index'], '--index needs a file name.\n' + USAGE],
    [['--loud'], 'Unknown option: --loud\n' + USAGE],
    [['--out', 'x.json'], 'Unknown option: --out\n' + USAGE],
    [['--word', 'a', '--tag', 'b'], 'Only one of --word, --tag and --links-to can be used at a time.\n' + USAGE],
    [['--word', 'a', '--word', 'b'], 'Only one of --word, --tag and --links-to can be used at a time.\n' + USAGE],
    [
      ['--word', 'Project', 'Plan'],
      'Unexpected argument: Plan\nIf what you are looking for has spaces in it, put it in quotes.\n' + USAGE,
    ],
    [
      ['sample-notes'],
      'Unexpected argument: sample-notes\nIf what you are looking for has spaces in it, put it in quotes.\n' + USAGE,
    ],
  ];
  for (const [args, stderr] of cases) {
    // Run from a folder with no index in it: every one of these must be turned away before an index is looked for.
    const result = run(args, join(tmp, 'no-index-here'));
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.stdout, '', args.join(' '));
    assert.equal(result.stderr, stderr, args.join(' '));
  }
});

test('fails when there is nothing in the query to search for', () => {
  const cases = [
    [['--word', '--'], 'There is no word to look for in "--": it has no letters or digits.\n'],
    [['--word', ''], 'There is no word to look for in "": it has no letters or digits.\n'],
    [['--tag', '#'], 'There is no tag to look for in "#".\n'],
    [['--links-to', '  '], 'There is no note name to look for.\n'],
  ];
  for (const [args, stderr] of cases) {
    const result = find(...args);
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.stdout, '', args.join(' '));
    assert.equal(result.stderr, stderr, args.join(' '));
  }
});

test('no failure prints a stack trace', () => {
  for (const args of [[], ['--word'], ['--word', '--'], ['--word', 'a', '--index', join(tmp, 'nowhere.json')]]) {
    assert.equal(run(args).stderr.includes('    at '), false);
  }
});

test('searching writes nothing: the index file is the same before and after', () => {
  const before = readFileSync(samplesIndex, 'utf8');
  find('--word', 'welcome');
  find('--tag', 'work');
  find('--links-to', 'Welcome');
  assert.equal(readFileSync(samplesIndex, 'utf8'), before);
});
