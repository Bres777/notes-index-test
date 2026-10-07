# notes-index

A small command-line tool that reads a folder of Markdown notes and builds an index of them.

This repository is a throwaway test of a way of working, not a product. It is built in stages by separate
workers, each of whom starts from this repository's diagram and digest plus a short brief.

## Stages

1. **Index** — built. Scan a folder for `.md` files, read each note's title, tags and links, and write `index.json`.
2. **Search** — planned, not started. Query the index by word, tag or link.

## Use

Built and tested on Node.js 22.20 on Windows; other versions and systems have not been tried. Nothing to
install: there are no dependencies.

```
node src/cli.js <folder> [--out index.json]
npm test
```

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

## Layout

- `src/` — the code, one module per job. Each file states its job in a one-line comment at its top (in
  `cli.js` that is the second line, because the `#!` line has to come first).
  - `scan.js` — list every `.md` file under a folder.
  - `parse-note.js` — turn one note's text into `{ path, title, tags, links, words }`.
  - `build-index.js` — run scan, read and parse each note, and combine the results into one index object.
  - `cli.js` — the command line: read the arguments, call build-index, write the file, print one line.
- `test/` — one test file per module, run with `npm test`. Tests that need folders on disk build them under
  `test/.tmp-<module>/` and delete them afterwards; those folders are ignored by git.
- `sample-notes/` — six notes that between them exercise every rule below. The tests check the index built
  from them, so changing a sample note means changing `test/build-index.test.js` and `test/cli.test.js` too.

## How the modules connect

```
cli.js  ->  build-index.js  ->  scan.js        (which files?)
                            ->  parse-note.js  (what is in each one?)
```

Only `build-index.js` reads note files and only `cli.js` writes anything. `scan.js` only lists folders;
`parse-note.js` touches no files at all, it is text in and an object out. Each module exports one function:
`scan(folder)`, `parseNote(text, path)`, `buildIndex(folder)`. `cli.js` exports nothing; it runs when started.

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
  "backlinks": { "Welcome": ["journal/2026-10-01.md", "project-plan.md"] }
}
```

- `generatedFrom` — the folder exactly as it was typed, with `\` turned into `/`. It is not made absolute.
- `notes` — one entry per note, sorted by `path`. Every `path` in the index is relative to the indexed folder
  and uses `/`, on every operating system.
- `tags` — each tag, with the paths of the notes that carry it. Keys are sorted.
- `backlinks` — each link target, exactly as written inside `[[...]]`, with the paths of the notes that link to
  it. Keys are sorted. A target is listed even when no note has that title (see `Budget 2027` in the sample
  notes), and a note that nothing links to has no entry. To find broken links, look for backlink keys that
  match no note's `title`.

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

## Known limits

- Notes are read as UTF-8. A file in another encoding is not detected: it is indexed as whatever the bytes
  happen to look like.
- A tag inside an HTML comment (`<!-- #hidden -->`) is still found. Front matter (a `---` block at the top of a
  note) is not understood; it is read as ordinary body text.
- Two notes may have the same title. Both are kept in `notes`, but `backlinks` cannot say which one a link
  means, because links name a title and not a path.
- A file named exactly `.md` gets an empty title.
- If `--out` names a `.md` file inside the folder being indexed, the next run will index that file as a note.
