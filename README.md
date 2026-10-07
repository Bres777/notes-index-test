# notes-index

A small command-line tool that reads a folder of Markdown notes, builds an index of them, and searches that index.

This repository is a throwaway test of a way of working, not a product. It is built in stages by separate
workers, each of whom starts from this repository's diagram and digest plus a short brief.

## Stages

1. **Index** — built. Scan a folder for `.md` files, read each note's title, tags, links and words, and write
   `index.json`.
2. **Search** — built. Ask the index which notes contain a word, carry a tag, or link to a note.

## Use

Built and tested on Node.js 22.20 on Windows; other versions and systems have not been tried. Nothing to
install: there are no dependencies.

```
node src/cli.js <folder> [--out index.json]
node src/search-cli.js (--word <word> | --tag <tag> | --links-to <note>) [--index index.json]
npm test
```

### Build the index

Try it on the notes that come with the repository:

```
node src/cli.js sample-notes
Indexed 6 notes, 8 tags and 5 links from sample-notes into index.json
```

- Without `--out`, the index is written to `index.json` in the folder the command is run from (that file is
  ignored by git).
- In the printed line, "tags" is the number of different tags and "links" is the number of different link
  targets, not the number of times they appear.
- The command exits with code 1 and a one-line message if the folder does not exist, is not a folder, holds no
  notes, the arguments are wrong, or the index cannot be written. Nothing is written in those cases.

### Search the index

Searching reads the index file and nothing else: it never opens a note. If notes have changed since the index
was built, build it again first, or the answers will be about the notes as they were.

```
node src/search-cli.js --word welcome
journal/2026-10-01.md	Meeting Notes
project-plan.md	Project Plan
welcome.md	Welcome

node src/search-cli.js --tag work
journal/2026-10-01.md	Meeting Notes
project-plan.md	Project Plan
scratch.md	scratch

node src/search-cli.js --links-to "Project Plan"
journal/2026-10-01.md	Meeting Notes
scratch.md	scratch
welcome.md	Welcome

node src/search-cli.js --links-to "Budget 2027"
project-plan.md	Project Plan
No note is titled "Budget 2027": this is a broken link.
```

- One search at a time: exactly one of `--word`, `--tag` and `--links-to`.
- Without `--index`, it reads `index.json` in the folder the command is run from.
- Each matching note is one line: its path, a tab, its title. The lines are sorted by path. They go to standard
  output and nothing else does, so the output can be piped or saved as it is.
- Anything said *about* the answer goes to standard error: that nothing was found, that a link is broken, that
  two notes share a title, that a query was read as several words.
- Finding nothing is not a failure: the exit code is 0, with one line such as `No note contains "zebra".`
- The command exits with code 1 and a plain message (no notes printed) if the arguments are wrong, there is
  nothing in the query to search for, or the index file is missing, is not JSON, or is not an index it can
  search. An index made before stage 2 has no word index and is refused, for every kind of search; build it again.
- Put a query that has spaces in quotes. A tag's `#` is optional — and in bash and PowerShell an unquoted
  `#work` is read as a comment and vanishes along with the rest of the line (Windows `cmd` passes it through),
  so leave the `#` off or write `"#work"`.

## Layout

- `src/` — the code, one module per job. Each file states its job in a one-line comment at its top (in
  `cli.js` and `search-cli.js` that is the second line, because the `#!` line has to come first).
  - `scan.js` — list every `.md` file under a folder.
  - `parse-note.js` — turn one note's text into `{ path, title, tags, links, words }`.
  - `extract-words.js` — turn a piece of text into the distinct words a search can look up.
  - `build-index.js` — run scan, read each note, run parse-note and extract-words on it, and combine the
    results into one index object.
  - `cli.js` — the indexing command line: read the arguments, call build-index, write the file, print one line.
  - `load-index.js` — read an index file back and refuse it if it is not an index that can be searched.
  - `search.js` — answer one question about an index object: `{ notes, remarks }`.
  - `search-cli.js` — the search command line: read the arguments, call load-index and search, print the notes.
- `test/` — one test file per module, run with `npm test` (`node --test` finds every `test/*.test.js` by
  itself; a new test file needs no registering). Tests that need folders on disk build them under
  `test/.tmp-<module>/` and delete them afterwards; those folders are ignored by git.
- `sample-notes/` — six notes that between them exercise every rule below. The tests check the index built
  from them and the searches made of it, so changing a sample note means changing `test/build-index.test.js`,
  `test/cli.test.js`, `test/search.test.js` and `test/search-cli.test.js` too.

## How the modules connect

```
cli.js         ->  build-index.js  ->  scan.js           (which files?)
                                   ->  parse-note.js     (what is in each one?)
                                   ->  extract-words.js  (which words are in each one?)
        writes index.json
                |
        reads index.json
search-cli.js  ->  load-index.js                         (is this file an index?)
               ->  search.js       ->  extract-words.js  (which words were typed?)
```

The two commands share no code path except `extract-words.js`; they meet only through the index file.
`extract-words.js` is used on both sides on purpose: a word search works because note text and the typed query
are cut into words by the same function.

Who may touch what:

- Only `build-index.js` reads note files. Only `load-index.js` reads an index file. Only `cli.js` writes anything.
- `scan.js` only lists folders. `parse-note.js`, `extract-words.js` and `search.js` touch no files at all.
- Search never reads a note and never writes.

What each module exports: `scan(folder)`, `parseNote(text, path)`, `extractWords(text)`, `buildIndex(folder)`,
`loadIndex(file)`, and from `search.js`: `search(index, kind, text)`, `KINDS` and `QueryError`. `cli.js` and
`search-cli.js` export nothing; they run when started, so their tests start them as separate processes.

## The index

```json
{
  "generatedFrom": "sample-notes",
  "noteCount": 6,
  "notes": [
    { "path": "journal/2026-10-01.md", "title": "Meeting Notes", "tags": ["journal", "work"],
      "links": ["Project Plan", "Welcome"], "words": 13 }
  ],
  "tags": { "work": ["journal/2026-10-01.md", "project-plan.md", "scratch.md"] },
  "backlinks": { "Welcome": ["journal/2026-10-01.md", "project-plan.md"] },
  "wordIndex": { "welcome": ["journal/2026-10-01.md", "project-plan.md", "welcome.md"] }
}
```

- `generatedFrom` — the folder exactly as it was typed, with `\` turned into `/`. It is not made absolute.
- `notes` — one entry per note, sorted by `path`. Every `path` in the index is relative to the indexed folder
  and uses `/`, on every operating system. A note's `words` is a count (see the rules); it is not the list of
  its words and is not what a word search uses.
- `tags` — each tag, with the paths of the notes that carry it.
- `backlinks` — each link target, exactly as written inside `[[...]]`, with the paths of the notes that link to
  it. A target is listed even when no note has that title (see `Budget 2027` in the sample notes), and a note
  that nothing links to has no entry.
- `wordIndex` — added in stage 2. Each word found anywhere in a note, in small letters, with the paths of the
  notes containing it. This is what `--word` looks in. For the sample notes it holds 100 words.
- Key order in `tags`, `backlinks` and `wordIndex`: sorted in plain character order — except that keys which
  are whole numbers (`42`, `2025`) come first, smallest number first. JavaScript orders an object's keys that
  way whatever order they are added in, so `2` comes before `42` before `2025`, where plain character order
  would put `2025` before `42`. The order is the same on every run. (Stage 1 said only "keys are sorted"; that
  was not true of a `backlinks` with whole-number targets such as `[[10]]` and `[[2]]`.)

## The rules

Which files are notes (`scan.js`):

- Any file whose name ends in `.md`, in capitals or not, in the folder or any folder below it.
- Folders named `node_modules`, and folders whose name starts with a dot, are not entered. This applies to
  folders below the one being indexed; the folder you name yourself is always entered.
- A file whose name starts with a dot is still a note.
- Symbolic links and Windows junctions are left out, whether they point at a folder or at a note. This means a
  loop of links cannot trap the scan.
- The order is plain character order, so capitals sort before small letters: `Beta.md` comes before `alpha.md`.

What is read from a note (`parse-note.js`):

- **title** — the text of the first line that starts with `# ` (one hash, then a space). If there is no such
  line, the file name without `.md`.
- **body** — every line except the title line.
- **tags** — every `#word` in the body, in small letters, each once, sorted. A tag must start at the beginning
  of a line or straight after a space or `(`. It may contain letters, digits, `_`, `-` and `/`, and must contain
  at least one letter, so `#123` is not a tag. A `-` or `/` at the very end is dropped. Heading lines (`#` to
  `######`) are not searched for tags.
- **links** — the target of every `[[Note Name]]`, each once, in the order they first appear. Capitals are
  kept: `[[Plan]]` and `[[plan]]` are two targets. `[[Name|shown text]]` and `[[Name#section]]` both give `Name`.
  Links in heading lines count.
- **words** — the number of space-separated chunks in the body that contain a letter or a digit. Tags, links
  and code count as words; list bullets and `---` do not.
- Fenced code blocks (between lines starting with ``` or `~~~`) are not searched for the title, tags or links,
  but their words are counted (the fence lines themselves are not). A fence that is never closed runs to the
  end of the note.

Which words can be searched for (`extract-words.js`):

- A word is an unbroken run of letters, digits and accent marks, in any alphabet. Every other character ends
  it, so `#area/work`, `[[Project Plan]]`, `notes-index` and `snake_case` give the words `area work`,
  `project plan`, `notes index` and `snake case`.
- An apostrophe between two such runs joins them: `don't` is one word. A curly apostrophe counts as a straight one.
- Words are put in small letters. An accented letter gives the same word whether it was typed as one character
  or as a letter followed by its accent.
- The whole note is used, nothing is skipped: the title line, headings, tags, links and code blocks all give
  words. This is deliberately not the same as the `words` count above, which leaves out the title line and
  counts chunks between spaces. `Welcome` is findable in a note whose only mention of it is its title.

How a search is matched (`search.js`):

- **`--word`** — what is typed is cut into words by the same rule as note text, so capitals and punctuation make
  no difference: `Welcome`, `WELCOME` and `[[welcome]]` are the same search. Only whole words match: `plan` does
  not find a note that only says `planning`. If what is typed is more than one word (`"project plan"`,
  `notes-index`), a note must contain all of them, anywhere in it and in any order — not as a phrase — and a
  remark says how the query was read.
- **`--tag`** — capitals make no difference and a leading `#` is optional. The whole tag must match: `archive`
  does not find `#archive/2025`; when longer tags like that exist a remark names them.
- **`--links-to`** — what is typed is a note's title. It may instead be the path of a note exactly as the index
  has it (`welcome.md`, `journal/2026-10-01.md`; `\` is accepted for `/`), which stands for that note's title.
  Capitals make no difference: the index keeps `[[Plan]]` and `[[plan]]` apart, but a search for either lists
  the notes that wrote either, and says so when both spellings were found.
- **Broken links** — a link to a title no note has is still found, because it is in `backlinks`. The notes are
  listed as usual and a remark says `No note is titled "…": this is a broken link.` To list every broken link
  in a folder, look in the index for `backlinks` keys that match no note's `title`; there is no command for it.
- **Shared titles** — if two notes have the title searched for, the notes linking to that title are listed once
  and a remark names the notes that share it. The index cannot say which of them a link means.

## Known limits

- Notes are read as UTF-8. A file in another encoding is not detected: it is indexed as whatever the bytes
  happen to look like.
- A tag inside an HTML comment (`<!-- #hidden -->`) is still found. Front matter (a `---` block at the top of a
  note) is not understood; it is read as ordinary body text, and its words can be searched for.
- Two notes may have the same title. Both are kept in `notes`, but `backlinks` cannot say which one a link
  means, because links name a title and not a path.
- A file named exactly `.md` gets an empty title.
- If `--out` names a `.md` file inside the folder being indexed, the next run will index that file as a note.
- Word search knows nothing about word endings or meaning: `note` does not find `notes`. It does not fold
  accents (`cafe` does not find `café`) and does not search for phrases.
- In writing that puts no spaces between words (Chinese, Japanese, Thai), a whole unbroken run of letters is
  one "word", so only the whole run can be searched for.
- Tags are not put into one accent form the way words and titles are, so a tag with an accented letter is only
  found when the accent is typed the same way as in the note.
- A note path given to `--links-to` must match the index's path exactly, capitals included.
- Only `[[wiki links]]` are links. An ordinary Markdown link `[text](other.md)` is not in the index, so
  `--links-to` does not find it.
- Numbers are cut at punctuation like everything else: `3.14` is the two words `3` and `14`, and `1,000` is
  not found by `1000`. `007` is not found by `7`.
- Capitals are folded the plain Unicode way, with no knowledge of any language: a Turkish `İstanbul` is found
  by `İSTANBUL` but not by `istanbul`.
- The word index makes `index.json` much bigger, because every different word of every note is listed once
  per note, and the file is written with one path per line. Measured: the sample notes' index went from 2 KB
  to 8 KB; a generated folder of 5,000 notes of about 200 words each went from 1.5 MB to 29 MB, took about 8
  seconds to index instead of 5, and each search of it took about half a second, nearly all of it loading the
  file. Search loads the whole file each time it runs.
- The index has no version number. An index too old to search is recognised only by having no `wordIndex`.
