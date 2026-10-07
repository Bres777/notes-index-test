// scan.js — one job: list every .md file under a folder, recursively, in a stable order.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKIPPED_FOLDER = 'node_modules';

function isSkippedFolder(name) {
  return name === SKIPPED_FOLDER || name.startsWith('.');
}

function isNoteFile(name) {
  return name.toLowerCase().endsWith('.md');
}

// Plain code-unit comparison: the same order on every machine, whatever its locale.
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Returns paths relative to `folder`, always with forward slashes, sorted.
// Throws the usual fs error if `folder` does not exist or is not a folder.
export function scan(folder) {
  const found = [];

  function walk(relativeFolder) {
    const entries = readdirSync(join(folder, relativeFolder), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!isSkippedFolder(entry.name)) walk(relativePath);
      } else if (entry.isFile() && isNoteFile(entry.name)) {
        found.push(relativePath);
      }
    }
  }

  walk('');
  return found.sort(byCodeUnit);
}
