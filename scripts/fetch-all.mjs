#!/usr/bin/env node
/**
 * Runs every build-time fetch, forwarding its own flags to each of them.
 *
 * This exists because of a real bug. `npm run data` used to be two commands chained with
 * `&&`, and npm appends the arguments after `--` to the *end of the whole string* — so
 * `npm run data -- --strict` handed `--strict` to the last script only. The deploy workflow
 * runs exactly that, which means the guard that stops a malformed sheet from publishing was
 * silently applying to the GitHub fetch and not to the sheet it was written for.
 *
 * A chain of `&&` cannot forward arguments to more than one command, so the orchestration
 * has to be a script. Each fetcher is spawned in turn with the same argv, inherits the
 * parent's environment (so `--env-file-if-exists=.env.local` on this process is enough),
 * and a non-zero exit stops the run rather than letting a later fetch mask an earlier
 * failure.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** In order. Projects first: it is the only one whose absence is fatal. */
const FETCHERS = ['fetch-projects.mjs', 'fetch-github.mjs'];

const args = process.argv.slice(2);

for (const script of FETCHERS) {
  const result = spawnSync(process.execPath, [path.join(HERE, script), ...args], {
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`\n[data] FAILED to start ${script}: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    // The child has already printed why. Exiting with its code keeps `npm run build`
    // failing for the same reason rather than a generic one.
    process.exit(result.status ?? 1);
  }
}
