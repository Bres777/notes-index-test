# notes-index

A small command-line tool that reads a folder of Markdown notes and builds an index of them.

This repository is a throwaway test of a way of working, not a product. It is built in stages by separate
workers, each of whom starts from this repository's diagram and digest plus a short brief.

## Planned stages

1. **Index** — scan a folder for `.md` files, read each note's title, tags and links, and write `index.json`.
2. **Search** — query the index by word, tag or link.

## Layout

- `src/` — the code, one module per job.
- `test/` — tests, run with `npm test`.
- `sample-notes/` — a few notes to run against.
