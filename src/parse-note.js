// parse-note.js — one job: turn one note's text and path into { path, title, tags, links, words }.

// The rules, in one place:
//   title — the first `# ` heading; if there is none, the file name without `.md`.
//   body  — every line except the title line. Fenced code blocks (``` or ~~~) stay in the body.
//   tags  — `#word` in the body, lower-cased, unique, sorted. A tag starts at the beginning of a line or
//           after a space or `(`, and is letters, digits, `_`, `-` or `/` with at least one letter (so
//           `#123` is not a tag); a trailing `-` or `/` is dropped. Heading lines and fenced code blocks
//           are not searched for tags.
//   links — the target of every `[[Note Name]]`, unique, in order of first appearance. `[[Name|shown text]]`
//           and `[[Name#section]]` both give `Name`. Fenced code blocks are not searched for links.
//   words — how many space-separated chunks of the body contain a letter or a digit.

const TITLE_LINE = /^# +(.*\S)\s*$/;
const HEADING_LINE = /^#{1,6}(\s|$)/;
const FENCE_LINE = /^\s*(```|~~~)/;
const TAG = /(?<=^|[\s(])#([\p{L}\p{N}_\/-]+)/gu;
const WIKI_LINK = /\[\[([^\[\]]+)\]\]/g;
const HAS_LETTER = /\p{L}/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function fileNameWithoutExtension(path) {
  const fileName = path.split(/[\\/]/).pop();
  return fileName.replace(/\.md$/i, '');
}

// `Name|shown text` and `Name#section` both point at the note called `Name`.
function linkTarget(insideBrackets) {
  return insideBrackets.split('|')[0].split('#')[0].trim();
}

function countWords(line) {
  return line.split(/\s+/).filter((chunk) => HAS_LETTER_OR_DIGIT.test(chunk)).length;
}

export function parseNote(text, path) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);

  let title = null;
  const tags = new Set();
  const links = [];
  let words = 0;
  let insideFence = false;

  for (const line of lines) {
    if (FENCE_LINE.test(line)) {
      insideFence = !insideFence;
      continue;
    }

    if (insideFence) {
      words += countWords(line);
      continue;
    }

    if (title === null) {
      const titleMatch = line.match(TITLE_LINE);
      if (titleMatch) {
        title = titleMatch[1];
        continue;
      }
    }

    words += countWords(line);

    if (!HEADING_LINE.test(line)) {
      for (const match of line.matchAll(TAG)) {
        const tag = match[1].replace(/[-\/]+$/, '');
        if (HAS_LETTER.test(tag)) tags.add(tag.toLowerCase());
      }
    }

    for (const match of line.matchAll(WIKI_LINK)) {
      const target = linkTarget(match[1]);
      if (target && !links.includes(target)) links.push(target);
    }
  }

  return {
    path,
    title: title ?? fileNameWithoutExtension(path),
    tags: [...tags].sort(),
    links,
    words,
  };
}
