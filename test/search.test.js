// Tests for src/search.js, run against the index of sample-notes/ and against small indexes written out by hand.
// The expected answers were worked out by reading the sample notes, not by running the search.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/build-index.js';
import { search, QueryError, KINDS } from '../src/search.js';

const samples = buildIndex(join(dirname(fileURLToPath(import.meta.url)), '..', 'sample-notes'));

const MEETING = { path: 'journal/2026-10-01.md', title: 'Meeting Notes' };
const OLD_IDEAS = { path: 'journal/archive/old-ideas.md', title: 'old-ideas' };
const PLAN = { path: 'project-plan.md', title: 'Project Plan' };
const READING = { path: 'reading-list.md', title: 'Reading List' };
const SCRATCH = { path: 'scratch.md', title: 'scratch' };
const WELCOME = { path: 'welcome.md', title: 'Welcome' };

// An index as it comes back from a file, with keys named like things built into objects. It is parsed from
// text because that is the only way `__proto__` becomes a key of its own, which is what a real index file gives.
const awkward = JSON.parse(`{
  "notes": [
    { "path": "a.md", "title": "Same Title" },
    { "path": "b.md", "title": "Same Title" },
    { "path": "c.md", "title": "constructor" }
  ],
  "tags": { "__proto__": ["a.md"], "constructor": ["a.md", "b.md"], "tostring": ["a.md"] },
  "backlinks": { "Same Title": ["b.md"], "__proto__": ["a.md"], "constructor": ["a.md"], "same title": ["b.md", "c.md"] },
  "wordIndex": { "constructor": ["a.md", "c.md"], "proto": ["a.md"], "same": ["a.md", "b.md"], "tostring": ["a.md"] }
}`);

// An index of nothing: every search of it must answer "no notes", never fail.
const empty = { notes: [], tags: {}, backlinks: {}, wordIndex: {} };

test('the answer is { notes, remarks }, each note as { path, title }, sorted by path', () => {
  assert.deepEqual(search(samples, 'word', 'welcome'), { notes: [MEETING, PLAN, WELCOME], remarks: [] });
});

test('the three kinds of search are word, tag and links-to; any other is a programming mistake', () => {
  assert.deepEqual(KINDS, ['word', 'tag', 'links-to']);
  assert.throws(() => search(samples, 'title', 'x'), TypeError);
  assert.throws(() => search(samples, 'constructor', 'x'), TypeError);
});

test('searching does not change the index', () => {
  const before = JSON.stringify(samples);
  for (const kind of KINDS) search(samples, kind, 'Welcome');
  assert.equal(JSON.stringify(samples), before);
});

// --- word ---

test('word: finds the notes containing it, whether in the title, the text, a tag, a link or a code block', () => {
  assert.deepEqual(search(samples, 'word', 'plan').notes, [MEETING, PLAN, SCRATCH, WELCOME]);
  assert.deepEqual(search(samples, 'word', 'planning').notes, [PLAN]);
  assert.deepEqual(search(samples, 'word', 'notatag').notes, [READING]);
  assert.deepEqual(search(samples, 'word', '2025').notes, [OLD_IDEAS]);
});

test('word: capitals and surrounding punctuation make no difference', () => {
  for (const typed of ['welcome', 'Welcome', 'WELCOME', ' welcome ', 'welcome!', '[[Welcome]]', '#welcome']) {
    assert.deepEqual(search(samples, 'word', typed).notes, [MEETING, PLAN, WELCOME], typed);
  }
});

test('word: only whole words match', () => {
  assert.deepEqual(search(samples, 'word', 'read').notes, [WELCOME]);
  assert.deepEqual(search(samples, 'word', 'reading').notes, [READING, WELCOME]);
  assert.deepEqual(search(samples, 'word', 'rea').notes, []);
});

test('word: several words find the notes containing all of them, and a remark says how they were read', () => {
  assert.deepEqual(search(samples, 'word', 'Project Plan'), {
    notes: [MEETING, PLAN, SCRATCH, WELCOME],
    remarks: ['"Project Plan" was read as 2 words (plan, project); a note must contain all of them.'],
  });
  assert.deepEqual(search(samples, 'word', 'meeting-welcome').notes, [MEETING, PLAN]);
  assert.deepEqual(search(samples, 'word', 'welcome zebra').notes, []);
  assert.deepEqual(search(samples, 'word', 'zebra welcome').notes, []);
});

test('word: the same word typed twice is one word', () => {
  assert.deepEqual(search(samples, 'word', 'plan PLAN'), { notes: [MEETING, PLAN, SCRATCH, WELCOME], remarks: [] });
});

test('word: a word no note contains gives no notes and no remarks', () => {
  assert.deepEqual(search(samples, 'word', 'zebra'), { notes: [], remarks: [] });
});

test('word: nothing to look for is a QueryError with a plain message', () => {
  for (const typed of ['', '   ', '---', '#', '!?']) {
    assert.throws(() => search(samples, 'word', typed), QueryError, typed);
  }
  assert.throws(() => search(samples, 'word', '--'), {
    message: 'There is no word to look for in "--": it has no letters or digits.',
  });
});

test('word: words named like built-in object properties find notes only if notes contain them', () => {
  for (const typed of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.deepEqual(search(samples, 'word', typed).notes, [], typed);
    assert.deepEqual(search(empty, 'word', typed).notes, [], typed);
  }
  assert.deepEqual(search(awkward, 'word', 'constructor').notes.map((note) => note.path), ['a.md', 'c.md']);
  assert.deepEqual(search(awkward, 'word', '__proto__').notes.map((note) => note.path), ['a.md']);
  assert.deepEqual(search(awkward, 'word', 'toString').notes.map((note) => note.path), ['a.md']);
  assert.deepEqual(search(awkward, 'word', 'hasOwnProperty').notes, []);
});

// --- tag ---

test('tag: finds the notes carrying it', () => {
  assert.deepEqual(search(samples, 'tag', 'work'), { notes: [MEETING, PLAN, SCRATCH], remarks: [] });
  assert.deepEqual(search(samples, 'tag', 'idea').notes, [OLD_IDEAS, SCRATCH]);
  assert.deepEqual(search(samples, 'tag', 'guide').notes, [WELCOME]);
});

test('tag: capitals, a leading "#" and spaces around it make no difference', () => {
  for (const typed of ['work', 'Work', 'WORK', '#work', '#Work', '  #work  ', '##work']) {
    assert.deepEqual(search(samples, 'tag', typed).notes, [MEETING, PLAN, SCRATCH], typed);
  }
});

test('tag: the whole tag must match, and a remark points at longer tags that were left out', () => {
  assert.deepEqual(search(samples, 'tag', 'archive'), {
    notes: [],
    remarks: ['Tags are matched whole, so #archive/2025 is a different tag and is not included.'],
  });
  assert.deepEqual(search(samples, 'tag', 'archive/2025'), { notes: [OLD_IDEAS], remarks: [] });
  assert.deepEqual(search(samples, 'tag', 'archive/2025/').notes, [OLD_IDEAS]);
  assert.deepEqual(search(samples, 'tag', 'wor').notes, []);
  assert.deepEqual(search(samples, 'tag', '2025').notes, []);
});

test('tag: a word that is in the notes but is not a tag finds nothing', () => {
  assert.deepEqual(search(samples, 'tag', 'not-a-tag'), { notes: [], remarks: [] });
  assert.deepEqual(search(samples, 'tag', 'notatag').notes, []);
  assert.deepEqual(search(samples, 'tag', 'welcome').notes, []);
});

test('tag: nothing to look for is a QueryError', () => {
  for (const typed of ['', '  ', '#', '##', '#/', '-']) {
    assert.throws(() => search(samples, 'tag', typed), QueryError, typed);
  }
});

test('tag: tags named like built-in object properties find notes only if notes carry them', () => {
  for (const typed of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.deepEqual(search(samples, 'tag', typed).notes, [], typed);
  }
  assert.deepEqual(search(awkward, 'tag', 'constructor').notes.map((note) => note.path), ['a.md', 'b.md']);
  assert.deepEqual(search(awkward, 'tag', '__proto__').notes.map((note) => note.path), ['a.md']);
  assert.deepEqual(search(awkward, 'tag', 'toString').notes.map((note) => note.path), ['a.md']);
  assert.deepEqual(search(awkward, 'tag', 'hasOwnProperty').notes, []);
});

// --- links-to ---

test('links-to: finds the notes that link to the note with that title', () => {
  assert.deepEqual(search(samples, 'links-to', 'Welcome'), { notes: [MEETING, PLAN], remarks: [] });
  assert.deepEqual(search(samples, 'links-to', 'Project Plan').notes, [MEETING, SCRATCH, WELCOME]);
  assert.deepEqual(search(samples, 'links-to', 'Meeting Notes').notes, [PLAN]);
  assert.deepEqual(search(samples, 'links-to', 'Reading List').notes, [WELCOME]);
});

test('links-to: capitals and spaces around the name make no difference', () => {
  for (const typed of ['welcome', 'WELCOME', '  Welcome  ']) {
    assert.deepEqual(search(samples, 'links-to', typed), { notes: [MEETING, PLAN], remarks: [] }, typed);
  }
  assert.deepEqual(search(samples, 'links-to', 'project plan').notes, [MEETING, SCRATCH, WELCOME]);
});

test('links-to: the path of a note stands for its title, and a remark says so', () => {
  assert.deepEqual(search(samples, 'links-to', 'welcome.md'), {
    notes: [MEETING, PLAN],
    remarks: ['welcome.md is the note titled "Welcome"; links to that title are listed.'],
  });
  assert.deepEqual(search(samples, 'links-to', 'journal/2026-10-01.md').notes, [PLAN]);
  assert.deepEqual(search(samples, 'links-to', 'journal\\2026-10-01.md').notes, [PLAN]);
});

test('links-to: a link to a note that does not exist is found and called broken', () => {
  assert.deepEqual(search(samples, 'links-to', 'Budget 2027'), {
    notes: [PLAN],
    remarks: ['No note is titled "Budget 2027": this is a broken link.'],
  });
});

test('links-to: a note that exists but that nothing links to gives no notes and no remarks', () => {
  assert.deepEqual(search(samples, 'links-to', 'scratch'), { notes: [], remarks: [] });
  assert.deepEqual(search(samples, 'links-to', 'old-ideas'), { notes: [], remarks: [] });
});

test('links-to: a name that is neither linked to nor a note says so', () => {
  assert.deepEqual(search(samples, 'links-to', 'Nobody'), {
    notes: [],
    remarks: ['No note is titled "Nobody" either.'],
  });
});

test('links-to: a section or shown text is not part of a name, because the index never holds one', () => {
  assert.deepEqual(search(samples, 'links-to', 'Welcome#Start here').notes, []);
  assert.deepEqual(search(samples, 'links-to', 'Meeting Notes|the last meeting').notes, []);
});

test('links-to: links that differ only in capitals are counted together, and shared titles are pointed out', () => {
  assert.deepEqual(search(awkward, 'links-to', 'same title'), {
    notes: [
      { path: 'b.md', title: 'Same Title' },
      { path: 'c.md', title: 'constructor' },
    ],
    remarks: [
      'Links written as "Same Title" and "same title" are all counted.',
      '2 notes are titled "Same Title" (a.md, b.md); a link names a title, not a path, so the index cannot say ' +
        'which of them a link means.',
    ],
  });
});

test('links-to: several broken links are called broken in the plural', () => {
  const index = { notes: [{ path: 'a.md', title: 'A' }, { path: 'b.md', title: 'B' }], tags: {}, wordIndex: {} };
  index.backlinks = { Gone: ['a.md', 'b.md'] };
  assert.deepEqual(search(index, 'links-to', 'gone').remarks, ['No note is titled "gone": these are broken links.']);
});

test('links-to: a note that links to itself is listed like any other', () => {
  const index = { notes: [{ path: 'a.md', title: 'Loop' }], tags: {}, backlinks: { Loop: ['a.md'] }, wordIndex: {} };
  assert.deepEqual(search(index, 'links-to', 'Loop'), { notes: [{ path: 'a.md', title: 'Loop' }], remarks: [] });
  assert.deepEqual(search(index, 'links-to', 'a.md').notes, [{ path: 'a.md', title: 'Loop' }]);
});

test('links-to: an accented title matches however its accents were typed', () => {
  const index = { notes: [{ path: 'a.md', title: 'Café' }], tags: {}, wordIndex: {} };
  index.backlinks = { 'Café': ['a.md'] };
  assert.deepEqual(search(index, 'links-to', 'CAFÉ'), { notes: [{ path: 'a.md', title: 'Café' }], remarks: [] });
});

test('links-to: nothing to look for is a QueryError', () => {
  for (const typed of ['', '   ']) {
    assert.throws(() => search(samples, 'links-to', typed), QueryError);
  }
});

test('links-to: names like built-in object properties find notes only if notes link to them', () => {
  for (const typed of ['__proto__', 'toString', 'hasOwnProperty']) {
    assert.deepEqual(search(samples, 'links-to', typed).notes, [], typed);
    assert.deepEqual(search(empty, 'links-to', typed).notes, [], typed);
  }
  assert.deepEqual(search(awkward, 'links-to', '__proto__'), {
    notes: [{ path: 'a.md', title: 'Same Title' }],
    remarks: ['No note is titled "__proto__": this is a broken link.'],
  });
  assert.deepEqual(search(awkward, 'links-to', 'Constructor'), {
    notes: [{ path: 'a.md', title: 'Same Title' }],
    remarks: [],
  });
});

// --- every kind, against the real notes ---

test('every word, tag and link in the sample index is found again by searching for it', () => {
  const titles = new Map(samples.notes.map((note) => [note.path, note.title]));
  const asNotes = (paths) => paths.map((path) => ({ path, title: titles.get(path) }));

  for (const [word, paths] of Object.entries(samples.wordIndex)) {
    assert.deepEqual(search(samples, 'word', word).notes, asNotes(paths), word);
  }
  for (const [tag, paths] of Object.entries(samples.tags)) {
    assert.deepEqual(search(samples, 'tag', `#${tag.toUpperCase()}`).notes, asNotes(paths), tag);
  }
  for (const [target, paths] of Object.entries(samples.backlinks)) {
    assert.deepEqual(search(samples, 'links-to', target).notes, asNotes(paths), target);
  }
});
