#!/usr/bin/env node
/**
 * Runs every visual gate in scripts/gates/, in filename order.
 *
 * The point of the indirection: CI calls this one command, so a new gate is a
 * new FILE, never a change to .github/workflows/ci.yml. That matters because
 * the autonomous loop (docs/LOOP.md) is forbidden from editing its own CI
 * config - without this, the loop could never strengthen its own taste checks,
 * only a human could. Adding a gate is now ordinary work the loop can do.
 *
 * The asymmetry is deliberate and is what keeps the rule safe: adding a gate
 * is one new file, while removing or weakening one is a deletion or an edit
 * that stands out in the diff the reviewer reads.
 *
 * A gate is any .mjs file in scripts/gates/. It runs with no arguments, reads
 * whatever it needs (rendered frames live in shots/current), prints its own
 * findings, and exits 0 to pass or non-zero to fail.
 *
 *   node scripts/gates.mjs
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const dir = 'scripts/gates';
const gates = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs'))
  .sort();

if (gates.length === 0) {
  console.error('gates: scripts/gates/ is empty - the visual gate is not a gate');
  process.exit(2);
}

let failed = 0;
for (const gate of gates) {
  const name = gate.replace(/\.mjs$/, '');
  const { status } = spawnSync(process.execPath, [join(dir, gate)], {
    stdio: 'inherit',
  });
  if (status !== 0) {
    failed += 1;
    console.error(`GATE FAIL  ${name} (exit ${status})`);
  } else {
    console.log(`GATE PASS  ${name}`);
  }
}

console.log(`\n${gates.length - failed}/${gates.length} gates passed`);
process.exit(failed === 0 ? 0 : 1);
